import React, { useMemo, useState } from 'react';
import { Expense, BudgetCategory } from '../types';
import { formatCurrency } from '../constants';
import { Calendar, TrendingUp, ArrowUpDown, Pencil, Trash2, X, Save, ChevronLeft, ChevronRight, Plane } from 'lucide-react';

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
    const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sortBy, setSortBy] = useState<'date' | 'category'>('date');
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
        return `Year ${displayedYear}`;
    }, [viewMode, selectedDate, displayedYear]);

    // Filter expenses
    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const d = new Date(e.date);
            const yearMatch = d.getFullYear() === displayedYear;

            if (viewMode === 'monthly') {
                return d.getMonth() === displayedMonth && yearMatch;
            } else {
                return yearMatch;
            }
        });
    }, [expenses, viewMode, displayedMonth, displayedYear]);

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
        if (window.confirm('Are you sure you want to delete this transaction?')) {
            try {
                await onDeleteExpense(expenseId);
            } catch (error) {
                console.error('Failed to delete expense:', error);
                alert('Failed to delete expense. Please try again.');
            }
        }
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
                        <p className="text-sm text-gray-500 mt-1">{dateLabel}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">Total Spent</p>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="w-full md:w-auto flex items-center justify-between gap-4">
                    {/* Date Navigation */}
                    <div className="flex items-center justify-between w-full md:w-auto bg-gray-50 rounded-lg p-1 border border-gray-200">
                        <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-md transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div className="px-4 py-1 min-w-[140px] text-center font-bold text-gray-800 text-sm md:text-base">
                            {dateLabel}
                        </div>
                        <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-md transition-colors">
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* View Toggle */}
                    <div className="bg-gray-100 p-1 rounded-lg flex shadow-inner flex-1 md:flex-none">
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`flex-1 md:flex-none justify-center px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${viewMode === 'monthly'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Calendar className="w-4 h-4" />
                            Monthly
                        </button>
                        <button
                            onClick={() => setViewMode('annual')}
                            className={`flex-1 md:flex-none justify-center px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${viewMode === 'annual'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <TrendingUp className="w-4 h-4" />
                            Annual
                        </button>
                    </div>

                    {/* Sort Dropdown */}
                    <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-gray-400" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'date' | 'category')}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="date">Date</option>
                            <option value="category">Category</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {sortedExpenses.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p className="font-medium">No transactions found</p>
                        <p className="text-sm mt-1">for {dateLabel}</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile View */}
                        <div className="md:hidden divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                            {sortedExpenses.map((expense) => (
                                <div key={expense.id} className="p-4 flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <span className="font-semibold text-gray-900">{expense.description}</span>
                                        <span className="font-bold text-gray-900">{formatCurrency(expense.amount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span>{expense.date}</span>
                                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                                {expense.category}
                                            </span>
                                            {expense.budgetItemName && (
                                                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-100">
                                                    <Plane className="w-3 h-3 inline mr-1" />
                                                    {expense.budgetItemName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            onClick={() => handleEdit(expense)}
                                            className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(expense.id)}
                                            className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto max-h-[60vh] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {sortedExpenses.map((expense) => (
                                        <tr key={expense.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.date}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                        {expense.category}
                                                    </span>
                                                    {expense.budgetItemName && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                                                            <Plane className="w-3 h-3 mr-1" />
                                                            {expense.budgetItemName}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{expense.description}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                                                {formatCurrency(expense.amount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleEdit(expense)}
                                                    className="text-indigo-600 hover:text-indigo-900 mx-1"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="text-red-600 hover:text-red-900 mx-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
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
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">Edit Transaction</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingExpense.date}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    value={editingExpense.category}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value as BudgetCategory })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3 bg-white"
                                >
                                    {Object.values(BudgetCategory).map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={editingExpense.description}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold text-sm">Rp</span>
                                    <input
                                        type="number"
                                        value={editingExpense.amount}
                                        onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                                        className="pl-9 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSaveEdit}
                                className="w-full mt-4 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center gap-2"
                            >
                                <Save className="w-5 h-5" />
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
