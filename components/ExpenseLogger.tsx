import React, { useState, useRef, useMemo } from 'react';
import { Camera, Upload, Loader2, Save, X, CalendarClock, CreditCard } from 'lucide-react';
import { fileToGenerativePart, analyzeReceipt } from '../services/geminiService';
import { BudgetCategory, Expense, BudgetLineItem } from '../types';

interface ExpenseLoggerProps {
    onSave: (expense: Expense) => void;
    budgetItems?: BudgetLineItem[];
}

const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({ onSave, budgetItems = [] }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState<'standard' | 'yearly_plan'>('standard');
  
  const [manualForm, setManualForm] = useState<Partial<Expense>>({
    category: BudgetCategory.Food,
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    description: '',
    budgetItemName: undefined
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter only Yearly items for the dropdown
  const yearlyBudgetItems = useMemo(() => {
    return budgetItems.filter(item => item.frequency === 'Yearly');
  }, [budgetItems]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const base64Data = await fileToGenerativePart(file);
      const mimeType = file.type;
      
      setImagePreview(`data:${mimeType};base64,${base64Data}`);
      setIsAnalyzing(true);

      try {
        const result = await analyzeReceipt(base64Data, mimeType);
        
        // Auto-fill form
        setManualForm(prev => ({
          ...prev,
          amount: result.amount,
          // Only overwrite category if in standard mode, otherwise keep the planned category
          category: expenseType === 'standard' ? (result.category as BudgetCategory) : prev.category, 
          date: result.date || new Date().toISOString().split('T')[0],
          description: result.merchant || 'Receipt Expense'
        }));
      } catch (error) {
        console.error(error);
        alert("Failed to analyze receipt. Please enter details manually.");
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleSave = () => {
    if (!manualForm.amount || !manualForm.category || !manualForm.date) {
      alert("Please fill in all required fields.");
      return;
    }

    if (expenseType === 'yearly_plan' && !manualForm.budgetItemName) {
        alert("Please select a specific yearly plan.");
        return;
    }

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      amount: Number(manualForm.amount),
      category: manualForm.category as BudgetCategory,
      date: manualForm.date!,
      description: manualForm.description || 'Expense',
      receiptUrl: imagePreview || undefined,
      budgetItemName: expenseType === 'yearly_plan' ? manualForm.budgetItemName : undefined
    };

    onSave(newExpense);
    
    // Reset
    handleClear();
  };

  const handleClear = () => {
    setImagePreview(null);
    setManualForm({
      category: BudgetCategory.Food,
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
      budgetItemName: undefined
    });
    setExpenseType('standard');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleYearlyItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedName = e.target.value;
      if (!selectedName) {
          setManualForm(prev => ({...prev, budgetItemName: undefined}));
          return;
      }

      const selectedItem = yearlyBudgetItems.find(i => i.name === selectedName);
      if (selectedItem) {
          setManualForm(prev => ({
              ...prev,
              budgetItemName: selectedItem.name,
              category: selectedItem.category, // Auto-lock category to the plan
              description: prev.description || selectedItem.name // Helpful default
          }));
      }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Input Expense</h2>
        
        {/* Toggle Type */}
        <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
            <button 
                onClick={() => setExpenseType('standard')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    expenseType === 'standard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <CreditCard className="w-4 h-4" />
                Standard
            </button>
            <button 
                onClick={() => setExpenseType('yearly_plan')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                    expenseType === 'yearly_plan' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <CalendarClock className="w-4 h-4" />
                From Yearly Plan
            </button>
        </div>

        {/* Upload Area */}
        <div className="mb-8">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          
          {!imagePreview ? (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-indigo-200 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <Camera className="w-8 h-8 text-indigo-600 mb-2" />
                <span className="text-sm font-medium text-indigo-900">Snap Receipt</span>
              </button>
              <button
                 onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <Upload className="w-8 h-8 text-gray-500 mb-2" />
                <span className="text-sm font-medium text-gray-700">Upload File</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
              <img src={imagePreview} alt="Receipt Preview" className="max-h-full max-w-full object-contain" />
              <button 
                onClick={handleClear}
                className="absolute top-2 right-2 bg-white/80 p-1 rounded-full text-gray-800 hover:bg-white"
              >
                <X className="w-5 h-5" />
              </button>
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 animate-spin mb-3" />
                  <p className="font-medium animate-pulse">AI is determining amount & category...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Form */}
        <div className="space-y-4">
          
          {/* Yearly Plan Selector */}
          {expenseType === 'yearly_plan' && (
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 animate-in slide-in-from-top-2">
                  <label className="block text-sm font-bold text-indigo-900 mb-1">Select Plan Allocation</label>
                  <select
                    value={manualForm.budgetItemName || ''}
                    onChange={handleYearlyItemChange}
                    className="w-full rounded-md border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 bg-white"
                  >
                      <option value="">-- Choose a Yearly Budget Item --</option>
                      {yearlyBudgetItems.map((item, idx) => (
                          <option key={idx} value={item.name}>{item.name} (Budget: {new Intl.NumberFormat('id-ID', {style: 'currency', currency:'IDR', maximumFractionDigits: 0}).format(item.amount)})</option>
                      ))}
                  </select>
                  <p className="text-xs text-indigo-600 mt-1">
                      Expense will be logged under <strong>{manualForm.category || '...'}</strong>
                  </p>
              </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500 font-bold">Rp</span>
              <input
                type="number"
                value={manualForm.amount}
                onChange={(e) => setManualForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={manualForm.category}
              disabled={expenseType === 'yearly_plan'} // Disable editing category if tied to a plan
              onChange={(e) => setManualForm(prev => ({ ...prev, category: e.target.value as BudgetCategory }))}
              className={`w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 bg-white ${expenseType === 'yearly_plan' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            >
              {Object.values(BudgetCategory).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm(prev => ({ ...prev, date: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3"
              />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
               <input
                type="text"
                value={manualForm.description}
                onChange={(e) => setManualForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3"
                placeholder="e.g. Starbucks"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isAnalyzing}
            className="w-full mt-6 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Save Expense
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseLogger;