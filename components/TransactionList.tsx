import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { Expense, BudgetCategory } from '../types';
import { formatCurrency } from '../constants';
import { ArrowUpDown, Pencil, Trash2, X, Save, Check, BarChart3, Calendar, Plane } from 'lucide-react';

interface TransactionListProps {
    expenses: Expense[];
    onEditExpense: (expense: Expense) => Promise<void>;
    onDeleteExpense: (expenseId: string) => Promise<void>;
}

const TransactionList: React.FC<TransactionListProps> = ({
    expenses,
    onEditExpense,
    onDeleteExpense,
}) => {
    const [selectedDate] = useState(new Date());
    const [sortBy, setSortBy] = useState<'date' | 'category'>('date');
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [chartRange, setChartRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1M');
    const [showChart, setShowChart] = useState(true);

    // Get days for range
    const getRangeDays = (range: typeof chartRange) => {
        switch (range) {
            case '1D': return 1;
            case '1W': return 7;
            case '1M': return 30;
            case '3M': return 90;
            case '1Y': return 365;
            case 'ALL': return 9999;
        }
    };

    // Filter expenses based on chartRange
    const filteredExpenses = useMemo(() => {
        const today = selectedDate;
        const days = getRangeDays(chartRange);

        return expenses.filter(e => {
            const d = new Date(e.date);
            const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (chartRange === 'ALL') return true;
            return diffDays >= 0 && diffDays < days;
        });
    }, [expenses, chartRange, selectedDate]);

    // Sort expenses
    const sortedExpenses = useMemo(() => {
        return [...filteredExpenses].sort((a, b) => {
            if (sortBy === 'category') {
                return a.category.localeCompare(b.category);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [filteredExpenses, sortBy]);

    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Chart data - spending based on range
    const chartData = useMemo(() => {
        const today = selectedDate;
        let days = 7;
        switch (chartRange) {
            case '1D': days = 1; break;
            case '1W': days = 7; break;
            case '1M': days = 30; break;
            case '3M': days = 90; break;
            case '1Y': days = 365; break;
            case 'ALL': days = 9999; break;
        }
        const data = [];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - days + 1);

        // For ALL, find earliest expense
        let effectiveDays = days;
        if (chartRange === 'ALL' && expenses.length > 0) {
            const sortedDates = expenses.map(e => new Date(e.date).getTime()).sort((a, b) => a - b);
            const earliest = new Date(sortedDates[0]);
            effectiveDays = Math.ceil((today.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }

        // Group by appropriate interval
        const interval = effectiveDays <= 7 ? 1 : effectiveDays <= 30 ? 1 : effectiveDays <= 90 ? 7 : 30;
        const groupedData: { [key: string]: number } = {};

        for (let i = effectiveDays - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const groupKey = interval === 1 ? dateStr :
                Math.floor(i / interval).toString();

            if (!groupedData[groupKey]) groupedData[groupKey] = 0;
            const dayTotal = expenses
                .filter(e => e.date === dateStr)
                .reduce((sum, e) => sum + e.amount, 0);
            groupedData[groupKey] += dayTotal;
        }

        // Convert to array for chart
        for (let i = Math.min(effectiveDays, chartRange === '1D' ? 24 : 30) - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i * (interval === 1 ? 1 : interval));
            const dateStr = date.toISOString().split('T')[0];

            const dayTotal = expenses
                .filter(e => {
                    const eDate = new Date(e.date);
                    const diff = Math.floor((date.getTime() - eDate.getTime()) / (1000 * 60 * 60 * 24));
                    return interval === 1 ? e.date === dateStr : diff >= 0 && diff < interval;
                })
                .reduce((sum, e) => sum + e.amount, 0);

            data.push({
                date: dateStr,
                label: date.toLocaleDateString('default', { day: 'numeric', month: 'short' }),
                shortLabel: date.toLocaleDateString('default', { day: 'numeric' }),
                amount: dayTotal,
            });
        }
        return data.slice(-30); // Limit to last 30 points for display
    }, [expenses, selectedDate, chartRange]);

    const chartTotal = chartData.reduce((sum, d) => sum + d.amount, 0);
    const chartAvg = chartData.length > 0 ? chartTotal / chartData.filter(d => d.amount > 0).length || 0 : 0;

    const handleEdit = (expense: Expense) => {
        setEditingExpense({ ...expense });
        setIsModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingExpense) return;
        try {
            await onEditExpense(editingExpense);
            setIsModalOpen(false);
            setEditingExpense(null);
        } catch (error) {
            console.error('Failed to update expense:', error);
            alert('Failed to update expense. Please try again.');
        }
    };

    const handleDelete = async (expenseId: string) => {
        if (window.confirm('Delete this transaction?')) {
            try {
                await onDeleteExpense(expenseId);
            } catch (error) {
                console.error('Failed to delete expense:', error);
                alert('Failed to delete expense. Please try again.');
            }
        }
    };

    return (
        <div className="flex flex-col gap-3 p-3 h-full overflow-hidden">
            {/* Chart Section with Integrated Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex-shrink-0">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Transactions</h2>
                        <p className="text-xs text-gray-500">{filteredExpenses.length} items</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Chart Toggle */}
                        <button
                            onClick={() => setShowChart(!showChart)}
                            className={`p-2 rounded-full transition-all ${showChart
                                ? 'bg-indigo-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                }`}
                            title={showChart ? "Hide Chart" : "Show Chart"}
                        >
                            <BarChart3 className="w-4 h-4" />
                        </button>
                        {/* Edit Toggle */}
                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`p-2 rounded-full transition-all ${isEditMode
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                }`}
                            title={isEditMode ? "Done Editing" : "Edit Mode"}
                        >
                            {isEditMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Total Display */}
                <div className="mb-2">
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(chartTotal)}</p>
                    <p className="text-xs text-gray-400">Avg: {formatCurrency(chartAvg)}/day</p>
                </div>

                {/* Range Selector */}
                <div className="flex justify-around mb-3 border-b border-gray-100 pb-2">
                    {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setChartRange(range)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${chartRange === range
                                ? 'bg-gray-100 text-gray-900 border border-gray-300'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>

                {/* Chart */}
                {showChart && (
                    <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="shortLabel"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                                    interval={'preserveStartEnd'}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1f2937',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        color: '#fff'
                                    }}
                                    formatter={(value: number) => [formatCurrency(value), 'Spent']}
                                    labelFormatter={(label) => label}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#6366f1"
                                    strokeWidth={1.5}
                                    fill="url(#colorSpending)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Sort Controls Only */}
            <div className="flex items-center justify-between bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex-shrink-0">
                <span className="text-xs text-gray-500 font-medium">Sort by:</span>
                <div className="bg-gray-100 p-0.5 rounded-lg flex shadow-inner">
                    <button
                        onClick={() => setSortBy('date')}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${sortBy === 'date'
                            ? 'bg-white text-gray-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <ArrowUpDown className="w-3 h-3" />
                        Date
                    </button>
                    <button
                        onClick={() => setSortBy('category')}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${sortBy === 'category'
                            ? 'bg-white text-gray-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Category
                    </button>
                </div>
            </div>

            {/* Transaction List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 min-h-0 flex flex-col overflow-hidden">
                {sortedExpenses.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium text-sm">No transactions</p>
                        <p className="text-xs mt-1">for selected period</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile View - Compact */}
                        <div className="md:hidden divide-y divide-gray-100 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
                            {sortedExpenses.map((expense) => {
                                const expDate = new Date(expense.date);
                                return (
                                    <div key={expense.id} className="p-3 flex items-center gap-3">
                                        {/* Big Day Number */}
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <span className="text-sm font-bold text-gray-900">{expDate.getDate()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-gray-900 text-sm truncate">{expense.description}</span>
                                                <span className="font-bold text-gray-900 text-sm whitespace-nowrap">{formatCurrency(expense.amount)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500 flex-wrap">
                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                                    {expense.category}
                                                </span>
                                                {expense.budgetItemName && (
                                                    <span className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                                        {expense.budgetItemName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isEditMode && (
                                            <div className="flex gap-1 animate-in fade-in slide-in-from-right-2">
                                                <button
                                                    onClick={() => handleEdit(expense)}
                                                    className="p-1.5 text-indigo-600 bg-indigo-50 rounded-md"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="p-1.5 text-red-600 bg-red-50 rounded-md"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop View - Compact */}
                        <div className="hidden md:flex md:flex-col flex-1 overflow-y-auto overscroll-contain">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        {isEditMode && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {sortedExpenses.map((expense) => {
                                        const expDate = new Date(expense.date);
                                        return (
                                            <tr key={expense.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 whitespace-nowrap">
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                        <span className="text-sm font-bold text-gray-900">{expDate.getDate()}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm">
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                                                            {expense.category}
                                                        </span>
                                                        {expense.budgetItemName && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-800">
                                                                <Plane className="w-2.5 h-2.5 mr-0.5" />
                                                                {expense.budgetItemName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{expense.description}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                                                    {formatCurrency(expense.amount)}
                                                </td>
                                                {isEditMode && (
                                                    <td className="px-4 py-2 whitespace-nowrap text-right text-sm animate-in fade-in">
                                                        <button onClick={() => handleEdit(expense)} className="text-indigo-600 hover:text-indigo-900 mx-0.5">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-900 mx-0.5">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Edit Modal */}
            {isModalOpen && editingExpense && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden relative z-10">
                        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Edit Transaction</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingExpense.date}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    value={editingExpense.category}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value as BudgetCategory })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 bg-white text-sm"
                                >
                                    {Object.values(BudgetCategory).map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={editingExpense.description}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-500 font-bold text-sm">Rp</span>
                                    <input
                                        type="number"
                                        value={editingExpense.amount}
                                        onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                                        className="pl-9 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSaveEdit}
                                className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 text-sm"
                            >
                                <Save className="w-4 h-4" />
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionList;
