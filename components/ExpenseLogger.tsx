import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Camera, Upload, Loader2, Save, X, CalendarClock, CreditCard, Plane } from 'lucide-react';
import { fileToGenerativePart, analyzeReceipt } from '../services/geminiService';
import { BudgetCategory, Expense, BudgetLineItem } from '../types';
import { formatCurrency } from '../constants';

interface ExpenseLoggerProps {
    onSave: (expense: Expense) => void;
    budgetItems?: BudgetLineItem[];
}

const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({ onSave, budgetItems = [] }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Persistent Mode State
  const [mode, setMode] = useState<'standard' | 'yearly'>('standard');
  const [selectedPlanName, setSelectedPlanName] = useState<string>('');

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

  // Derived active plan based on selection
  const activeYearlyPlan = useMemo(() => {
    if (mode === 'yearly' && selectedPlanName) {
      return budgetItems.find(i => i.name === selectedPlanName);
    }
    return null;
  }, [mode, selectedPlanName, budgetItems]);

  // Effect: When active plan changes, auto-update the category/context
  useEffect(() => {
      if (activeYearlyPlan) {
          setManualForm(prev => ({
              ...prev,
              category: activeYearlyPlan.category,
              budgetItemName: activeYearlyPlan.name
          }));
      } else if (mode === 'standard') {
          setManualForm(prev => ({
              ...prev,
              budgetItemName: undefined
          }));
      }
  }, [activeYearlyPlan, mode]);

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
          // Only overwrite category if NOT in yearly mode. If in yearly mode, we trust the plan's category.
          category: activeYearlyPlan ? activeYearlyPlan.category : (result.category as BudgetCategory), 
          date: result.date || new Date().toISOString().split('T')[0],
          description: result.merchant || 'Receipt Expense',
          budgetItemName: activeYearlyPlan ? activeYearlyPlan.name : undefined
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

    if (mode === 'yearly' && !activeYearlyPlan) {
        alert("Please select a specific yearly plan to log this expense against.");
        return;
    }

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      amount: Number(manualForm.amount),
      category: manualForm.category as BudgetCategory,
      date: manualForm.date!,
      description: manualForm.description || 'Expense',
      receiptUrl: imagePreview || undefined,
      budgetItemName: activeYearlyPlan ? activeYearlyPlan.name : undefined
    };

    onSave(newExpense);
    
    // Reset Form Fields only, keep the mode active
    handleClearFormFields();
  };

  const handleClearFormFields = () => {
    setImagePreview(null);
    setManualForm(prev => ({
      category: activeYearlyPlan ? activeYearlyPlan.category : BudgetCategory.Food,
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
      budgetItemName: activeYearlyPlan ? activeYearlyPlan.name : undefined
    }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      
      {/* Global Mode Selector */}
      <div className="border-b border-gray-100">
          <div className="flex">
              <button 
                  onClick={() => setMode('standard')} 
                  className={`flex-1 p-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      mode === 'standard' 
                          ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' 
                          : 'text-gray-500 hover:bg-gray-50'
                  }`}
              >
                 <CreditCard size={18} /> 
                 <span>Regular Spending</span>
              </button>
              <button 
                  onClick={() => setMode('yearly')} 
                  className={`flex-1 p-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      mode === 'yearly' 
                          ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' 
                          : 'text-gray-500 hover:bg-gray-50'
                  }`}
              >
                 <Plane size={18} /> 
                 <span>Event / Trip Mode</span>
              </button>
          </div>
          
          {/* Active Plan Selector Panel */}
          {mode === 'yearly' && (
              <div className="p-4 bg-purple-50 border-b border-purple-100 animate-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-purple-900 uppercase tracking-wide mb-2">Select Active Event Plan</label>
                  <select 
                      value={selectedPlanName}
                      onChange={(e) => setSelectedPlanName(e.target.value)}
                      className="w-full rounded-lg border-purple-200 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2.5 px-3 bg-white text-purple-900 font-medium"
                  >
                      <option value="">-- Select an Event (e.g. Vacation) --</option>
                      {yearlyBudgetItems.map((item, idx) => (
                          <option key={idx} value={item.name}>{item.name} ({formatCurrency(item.amount)})</option>
                      ))}
                  </select>
                  
                  {activeYearlyPlan ? (
                       <div className="mt-3 flex items-start gap-2 text-xs text-purple-800 bg-white/50 p-2 rounded-md border border-purple-100">
                           <span className="relative flex h-2 w-2 mt-1">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                           </span>
                           <div>
                               <strong>Mode Active:</strong> All expenses entered below will be logged under <strong>"{activeYearlyPlan.name}"</strong> ({activeYearlyPlan.category}).
                           </div>
                       </div>
                  ) : (
                      <p className="text-xs text-purple-600 mt-2 italic">Please select a plan to start logging.</p>
                  )}
              </div>
          )}
      </div>

      <div className="p-6">
        <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">
            {activeYearlyPlan ? (
                <>Logging to: <span className="text-purple-600 underline decoration-dotted">{activeYearlyPlan.name}</span></>
            ) : (
                "Log Expense"
            )}
        </h2>

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
                disabled={mode === 'yearly' && !activeYearlyPlan}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors ${
                    mode === 'yearly' && !activeYearlyPlan 
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                }`}
              >
                <Camera className={`w-8 h-8 mb-2 ${mode === 'yearly' && !activeYearlyPlan ? 'text-gray-300' : 'text-indigo-600'}`} />
                <span className={`text-sm font-medium ${mode === 'yearly' && !activeYearlyPlan ? 'text-gray-400' : 'text-indigo-900'}`}>Snap Receipt</span>
              </button>
              <button
                 onClick={() => fileInputRef.current?.click()}
                 disabled={mode === 'yearly' && !activeYearlyPlan}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors ${
                    mode === 'yearly' && !activeYearlyPlan 
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <Upload className={`w-8 h-8 mb-2 ${mode === 'yearly' && !activeYearlyPlan ? 'text-gray-300' : 'text-gray-500'}`} />
                <span className={`text-sm font-medium ${mode === 'yearly' && !activeYearlyPlan ? 'text-gray-400' : 'text-gray-700'}`}>Upload File</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
              <img src={imagePreview} alt="Receipt Preview" className="max-h-full max-w-full object-contain" />
              <button 
                onClick={handleClearFormFields}
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
        <div className={`space-y-4 ${mode === 'yearly' && !activeYearlyPlan ? 'opacity-50 pointer-events-none' : ''}`}>
          
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
              disabled={!!activeYearlyPlan} // Always disable if a plan is active (it locks the category)
              onChange={(e) => setManualForm(prev => ({ ...prev, category: e.target.value as BudgetCategory }))}
              className={`w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 bg-white ${activeYearlyPlan ? 'bg-gray-100 text-gray-500 cursor-lock' : ''}`}
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
            className={`w-full mt-6 text-white py-3 px-4 rounded-lg font-medium shadow-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                activeYearlyPlan 
                ? 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500' 
                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
            }`}
          >
            <Save className="w-5 h-5" />
            {activeYearlyPlan ? `Log to ${activeYearlyPlan.name}` : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseLogger;