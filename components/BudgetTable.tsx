import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../constants';
import { BudgetCategory, BudgetLineItem, IncomeEntry } from '../types';
import { Plus, Pencil, Trash2, X, Save, Check } from 'lucide-react';

interface BudgetTableProps {
  budgetItems: BudgetLineItem[];
  onUpdateBudget: (items: BudgetLineItem[]) => void;
  incomeData?: IncomeEntry[];
}

const BudgetTable: React.FC<BudgetTableProps> = ({ budgetItems, onUpdateBudget, incomeData = [] }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<string>('100%');
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);

  const distinctCategories = useMemo(() => {
    const defaults = Object.values(BudgetCategory) as string[];
    const current = budgetItems.map(item => item.category);
    return Array.from(new Set([...defaults, ...current])).sort();
  }, [budgetItems]);

  const [formData, setFormData] = useState<BudgetLineItem>({
    category: BudgetCategory.Food,
    name: '',
    amount: 0,
    frequency: 'Monthly'
  });

  // Prevent background scroll and handle visual viewport for keyboard
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';

      const handleResize = () => {
        if (window.visualViewport) {
          // Use visualViewport height to avoid keyboard covering the modal
          setViewportHeight(`${window.visualViewport.height}px`);
        } else {
          setViewportHeight(`${window.innerHeight}px`);
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
        // Initial set
        setViewportHeight(`${window.visualViewport.height}px`);
      } else {
        window.addEventListener('resize', handleResize);
        setViewportHeight(`${window.innerHeight}px`);
      }

      return () => {
        document.body.style.overflow = 'unset';
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleResize);
        } else {
          window.removeEventListener('resize', handleResize);
        }
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isModalOpen]);

  const handleOpenModal = (index?: number) => {
    if (index !== undefined) {
      setEditingIndex(index);
      setFormData({ ...budgetItems[index] });
    } else {
      setEditingIndex(null);
      setFormData({
        category: BudgetCategory.Food,
        name: '',
        amount: 0,
        frequency: 'Monthly'
      });
    }
    setIsCustomCategoryMode(false);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || formData.amount <= 0) {
      alert("Please enter a valid name and amount.");
      return;
    }

    const newItems = [...budgetItems];
    if (editingIndex !== null) {
      // Update
      newItems[editingIndex] = formData;
    } else {
      // Add
      newItems.push(formData);
    }

    onUpdateBudget(newItems);
    setIsModalOpen(false);
  };

  const handleDelete = (index: number) => {
    if (window.confirm("Are you sure you want to delete this budget item?")) {
      const newItems = budgetItems.filter((_, i) => i !== index);
      onUpdateBudget(newItems);
    }
  };

  // Group items by category for display
  const monthlyItems = budgetItems.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.frequency === 'Monthly');
  const yearlyItems = budgetItems.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.frequency === 'Yearly');

  const totalMonthly = monthlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  const totalYearly = yearlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  const grandTotal = (totalMonthly * 12) + totalYearly;

  // Calculate Net Income for 2025 and 2026
  const incomeSummary = useMemo(() => {
    let lyNet = 0; // 2025
    let tyNet = 0; // 2026

    incomeData.forEach(entry => {
      // Logic to extract year from entry.month or entry.date
      let entryYear = 0;

      // Try format: "2025-07" or "2025-07-31" in month or date
      const isoMatch = (entry.month || entry.date)?.match(/^(\d{4})/);
      if (isoMatch) {
        entryYear = parseInt(isoMatch[1]);
      } else if (entry.date) {
        // Try parsing full date string
        const d = new Date(entry.date);
        if (!isNaN(d.getTime())) {
          entryYear = d.getFullYear();
        }
      }

      const amount = Number(entry.takeHomePay || 0);
      if (entryYear === 2025) lyNet += amount;
      if (entryYear === 2026) tyNet += amount;
    });

    return { lyNet, tyNet };
  }, [incomeData]);

  const RenderSection = ({
    title,
    items,
    type
  }: {
    title: string,
    items: (BudgetLineItem & { originalIndex: number })[],
    type: 'monthly' | 'yearly'
  }) => {
    // Group by category
    const grouped: Record<string, typeof items> = {};
    items.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    const categories = Object.keys(grouped).sort();
    const sectionTotal = items.reduce((sum, i) => sum + i.amount, 0);
    const colSpanCount = type === 'monthly' ? (isEditMode ? 4 : 3) : (isEditMode ? 3 : 2);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-4 md:px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              {type === 'monthly'
                ? "Recurring expenses (Per Month)"
                : "Annual events (Per Year)"}
            </p>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category / Item</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                {type === 'monthly' && (
                  <th className="px-6 py-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wider">Annualized</th>
                )}
                {isEditMode && (
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((cat) => {
                const categorySubtotal = grouped[cat].reduce((sum, item) => sum + item.amount, 0);
                return (
                  <React.Fragment key={cat}>
                    <tr className="bg-gray-50/50">
                      <td colSpan={colSpanCount} className="px-6 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {cat}
                      </td>
                    </tr>
                    {grouped[cat].map((item) => (
                      <tr key={`${cat}-${item.originalIndex}`} className="group hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 pl-8 border-l-4 border-transparent hover:border-indigo-200">
                          {item.name}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-700 font-medium">
                          {formatCurrency(item.amount)}
                        </td>
                        {type === 'monthly' && (
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-indigo-600">
                            {formatCurrency(item.amount * 12)}
                          </td>
                        )}
                        {isEditMode && (
                          <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                            <button onClick={() => handleOpenModal(item.originalIndex)} className="text-indigo-600 hover:text-indigo-900 mx-2">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(item.originalIndex)} className="text-red-600 hover:text-red-900 mx-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {/* Subtotal Row */}
                    <tr className="bg-white">
                      <td className="px-6 py-2 whitespace-nowrap text-xs text-gray-400 text-right font-medium italic">
                        Subtotal
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-t border-gray-100">
                        {formatCurrency(categorySubtotal)}
                      </td>
                      {type === 'monthly' && (
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-indigo-400 font-medium border-t border-gray-100">
                          {formatCurrency(categorySubtotal * 12)}
                        </td>
                      )}
                      {isEditMode && <td></td>}
                    </tr>
                  </React.Fragment>
                )
              })}
              <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-100">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900">Total</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-indigo-900">
                  {formatCurrency(sectionTotal)}
                </td>
                {type === 'monthly' && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-indigo-900">
                    {formatCurrency(sectionTotal * 12)}
                  </td>
                )}
                {isEditMode && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile Card/List View */}
        <div className="md:hidden">
          {categories.map((cat) => {
            const categorySubtotal = grouped[cat].reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={cat} className="border-b border-gray-100 last:border-0">
                <div className="bg-gray-50/50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {cat}
                </div>
                <div className="divide-y divide-gray-100">
                  {grouped[cat].map((item) => (
                    <div key={`${cat}-${item.originalIndex}`} className="px-4 py-3 flex justify-between items-center bg-white group">
                      <div>
                        <span className="text-sm text-gray-900 block">{item.name}</span>
                        {type === 'monthly' && (
                          <div className="text-[10px] text-gray-400">x12 = {formatCurrency(item.amount * 12)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</div>
                        {isEditMode && (
                          <div className="flex gap-1 animate-in fade-in slide-in-from-right-4 duration-200">
                            <button onClick={() => handleOpenModal(item.originalIndex)} className="p-1.5 text-indigo-600 bg-indigo-50 rounded-md">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(item.originalIndex)} className="p-1.5 text-red-600 bg-red-50 rounded-md">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-50/30 px-4 py-2 flex justify-between items-center text-xs font-medium text-gray-500 border-t border-gray-100">
                  <span className="italic">Subtotal</span>
                  <span className="font-bold text-gray-700">{formatCurrency(categorySubtotal)}</span>
                </div>
              </div>
            )
          })}
          <div className="bg-indigo-50 px-4 py-4 flex justify-between items-center border-t border-indigo-100">
            <span className="text-sm font-bold text-indigo-900">Total</span>
            <span className="text-sm font-bold text-indigo-900">{formatCurrency(sectionTotal)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 px-4 py-4">
      <div className="space-y-6 pb-20 md:pb-6 relative">
        {/* Top Summary Card */}
        <div className="bg-indigo-900 text-white rounded-xl p-6 shadow-md relative overflow-hidden shrink-0">
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 pointer-events-none blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-600/20 rounded-full -ml-24 -mb-24 pointer-events-none blur-2xl"></div>

          {/* Toggle Edit Button */}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`absolute top-4 right-4 z-20 p-2 rounded-lg transition-all ${isEditMode
              ? 'bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-400/50'
              : 'bg-white/10 text-indigo-200 hover:bg-white/20 hover:text-white'
              }`}
            title={isEditMode ? "Done Editing" : "Edit Plan"}
          >
            {isEditMode ? <Check className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          </button>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Main Total Section (col-span-5) */}
            <div className="md:col-span-12 lg:col-span-5 text-center lg:text-left">
              <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-[0.2em] mb-2">Total Annual Budget</h3>
              <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">
                {formatCurrency(grandTotal)}
              </p>

              <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-3">
                <div className="flex items-center gap-2 bg-indigo-800/50 px-3 py-1.5 rounded-lg border border-indigo-700">
                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                  <div>
                    <span className="text-[10px] text-indigo-300 block leading-none font-bold uppercase">LY Net</span>
                    <span className="text-sm font-mono font-bold">{formatCurrency(incomeSummary.lyNet)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-900/40 px-3 py-1.5 rounded-lg border border-emerald-800/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <div>
                    <span className="text-[10px] text-emerald-300 block leading-none font-bold uppercase">TY Net YTD</span>
                    <span className="text-sm font-mono font-bold text-emerald-100">{formatCurrency(incomeSummary.tyNet)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown Stats (col-span-7) */}
            <div className="md:col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Monthly Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/15 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-indigo-200 text-xs font-bold uppercase">Monthly Recurring</span>
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-indigo-100 opacity-60 group-hover:opacity-100 transition-opacity">x12</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{formatCurrency(totalMonthly * 12)}</span>
                  <span className="text-xs text-indigo-300 font-medium">/ year</span>
                </div>
                <div className="mt-1 pt-2 border-t border-white/10 text-xs text-indigo-200 flex justify-between">
                  <span>Base Monthly:</span>
                  <span className="font-mono text-white">{formatCurrency(totalMonthly)}</span>
                </div>
              </div>

              {/* Annual Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/15 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-indigo-200 text-xs font-bold uppercase">Annual Events</span>
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-indigo-100 opacity-60">Yearly</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{formatCurrency(totalYearly)}</span>
                  <span className="text-xs text-indigo-300 font-medium">/ year</span>
                </div>
                <div className="mt-1 pt-2 border-t border-white/10 text-xs text-indigo-200">
                  <span>One-time & periodic items</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Item Button - ONLY visible in Edit Mode */}
        {isEditMode && (
          <button
            onClick={() => handleOpenModal()}
            className="w-full py-4 border-2 border-dashed border-indigo-300 rounded-xl flex items-center justify-center gap-2 text-indigo-600 font-bold hover:bg-indigo-50 transition-colors animate-in fade-in zoom-in"
          >
            <Plus className="w-6 h-6" />
            Add New Budget Item
          </button>
        )}

        <RenderSection title="Monthly Recurring" items={monthlyItems} type="monthly" />
        <RenderSection title="Annual Events" items={yearlyItems} type="yearly" />

        {/* Edit/Add Modal */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            // We set the height of the container to match the Visual Viewport.
            // This ensures that when the keyboard opens (shrinking the visual viewport), 
            // the flex items-center logic recenters the modal in the *remaining* space (above keyboard).
            style={{ height: viewportHeight, top: 0 }}
          >
            {/* Backdrop - fixed to screen to cover everything even if viewport shrinks */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal Content - Animated and Centered in the dynamic viewport */}
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90%] relative z-10 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-800">
                  {editingIndex !== null ? 'Edit Budget Item' : 'New Budget Item'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Internet Bill"
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  {isCustomCategoryMode ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="Enter new category name"
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          setIsCustomCategoryMode(false);
                          setFormData(prev => ({ ...prev, category: BudgetCategory.Food }));
                        }}
                        className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-300"
                        title="Cancel custom category"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomCategoryMode(true);
                          setFormData(prev => ({ ...prev, category: '' }));
                        } else {
                          setFormData(prev => ({ ...prev, category: e.target.value }));
                        }
                      }}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3 bg-white"
                    >
                      {distinctCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__NEW__" className="font-bold text-indigo-600">+ Create New Category...</option>
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-500 font-bold text-sm">Rp</span>
                      <input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                        className="pl-9 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value as 'Monthly' | 'Yearly' }))}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3 bg-white"
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  className="w-full mt-4 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Save Item
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetTable;