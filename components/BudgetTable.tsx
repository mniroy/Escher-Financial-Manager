import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../constants';
import { BudgetCategory, BudgetLineItem } from '../types';
import { Plus, Pencil, Trash2, X, Save, Check } from 'lucide-react';

interface BudgetTableProps {
  budgetItems: BudgetLineItem[];
  onUpdateBudget: (items: BudgetLineItem[]) => void;
}

const BudgetTable: React.FC<BudgetTableProps> = ({ budgetItems, onUpdateBudget }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<string>('100%');
  
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
  const monthlyItems = budgetItems.map((item, index) => ({...item, originalIndex: index})).filter(item => item.frequency === 'Monthly');
  const yearlyItems = budgetItems.map((item, index) => ({...item, originalIndex: index})).filter(item => item.frequency === 'Yearly');

  const totalMonthly = monthlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  const totalYearly = yearlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  const grandTotal = (totalMonthly * 12) + totalYearly;

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

    const categories = Object.keys(grouped) as BudgetCategory[];
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
                    : "Annual obligations (Per Year)"}
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
                      )})}
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
              )})}
              <div className="bg-indigo-50 px-4 py-4 flex justify-between items-center border-t border-indigo-100">
                  <span className="text-sm font-bold text-indigo-900">Total</span>
                  <span className="text-sm font-bold text-indigo-900">{formatCurrency(sectionTotal)}</span>
              </div>
          </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6 relative">
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm transition-colors border ${
            isEditMode 
              ? 'bg-indigo-100 text-indigo-700 border-indigo-200' 
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {isEditMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          {isEditMode ? 'Done' : 'Edit List'}
        </button>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Item
        </button>
      </div>

      {/* NEW: Top Summary Card */}
      <div className="bg-indigo-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="z-10 text-center md:text-left">
          <h3 className="text-indigo-200 text-sm font-medium uppercase tracking-wider mb-1">Total Annual Budget</h3>
          <p className="text-3xl md:text-4xl font-extrabold tracking-tight">{formatCurrency(grandTotal)}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 z-10 w-full md:w-auto">
           <div className="bg-white/10 rounded-lg p-3 flex-1 text-center md:text-right backdrop-blur-sm">
              <p className="text-indigo-200 text-xs mb-1">Annualized Monthly</p>
              <p className="font-bold text-lg">{formatCurrency(totalMonthly * 12)}</p>
              <p className="text-[10px] text-indigo-300">({formatCurrency(totalMonthly)} / mo)</p>
           </div>
           <div className="bg-white/10 rounded-lg p-3 flex-1 text-center md:text-right backdrop-blur-sm">
              <p className="text-indigo-200 text-xs mb-1">Annual Obligations</p>
              <p className="font-bold text-lg">{formatCurrency(totalYearly)}</p>
              <p className="text-[10px] text-indigo-300">(One-off / Yearly items)</p>
           </div>
        </div>
      </div>

      <RenderSection title="Monthly Recurring" items={monthlyItems} type="monthly" />
      <RenderSection title="Yearly Assets & Obligations" items={yearlyItems} type="yearly" />
      
      {/* Edit/Add Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
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
                  onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                  placeholder="e.g. Internet Bill"
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({...prev, category: e.target.value as BudgetCategory}))}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3 bg-white"
                >
                  {Object.values(BudgetCategory).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold text-sm">Rp</span>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({...prev, amount: Number(e.target.value)}))}
                      className="pl-9 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 border px-3"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData(prev => ({...prev, frequency: e.target.value as 'Monthly' | 'Yearly'}))}
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
  );
};

export default BudgetTable;