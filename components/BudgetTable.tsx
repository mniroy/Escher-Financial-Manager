import React from 'react';
import { formatCurrency } from '../constants';
import { BudgetCategory, BudgetLineItem } from '../types';

interface BudgetTableProps {
  budgetItems: BudgetLineItem[];
}

const BudgetTable: React.FC<BudgetTableProps> = ({ budgetItems }) => {
  // Group items by category for display
  const monthlyItems = budgetItems.filter(item => item.frequency === 'Monthly');
  const yearlyItems = budgetItems.filter(item => item.frequency === 'Yearly');

  const totalMonthly = monthlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  const totalYearly = yearlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  
  const grandTotal = (totalMonthly * 12) + totalYearly;

  const RenderSection = ({ 
    title, 
    items, 
    type 
  }: { 
    title: string, 
    items: BudgetLineItem[], 
    type: 'monthly' | 'yearly' 
  }) => {
    // Group by category
    const grouped: Record<string, BudgetLineItem[]> = {};
    items.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    const categories = Object.keys(grouped) as BudgetCategory[];
    const sectionTotal = items.reduce((sum, i) => sum + i.amount, 0);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="px-4 md:px-6 py-5 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                {type === 'monthly' 
                  ? "Recurring expenses (Per Month)" 
                  : "Annual obligations (Per Year)"}
              </p>
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
                      </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                      {categories.map((cat) => (
                        <React.Fragment key={cat}>
                          <tr className="bg-gray-50/50">
                            <td colSpan={type === 'monthly' ? 3 : 2} className="px-6 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                              {cat}
                            </td>
                          </tr>
                          {grouped[cat].map((item, idx) => (
                             <tr key={`${cat}-${idx}`} className="hover:bg-gray-50 transition-colors">
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
                             </tr>
                          ))}
                        </React.Fragment>
                      ))}
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
                      </tr>
                  </tbody>
              </table>
          </div>

          {/* Mobile Card/List View */}
          <div className="md:hidden">
              {categories.map((cat) => (
                  <div key={cat} className="border-b border-gray-100 last:border-0">
                      <div className="bg-gray-50/50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {cat}
                      </div>
                      <div className="divide-y divide-gray-100">
                          {grouped[cat].map((item, idx) => (
                              <div key={`${cat}-${idx}`} className="px-4 py-3 flex justify-between items-center bg-white">
                                  <span className="text-sm text-gray-900">{item.name}</span>
                                  <div className="text-right">
                                      <div className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</div>
                                      {type === 'monthly' && (
                                          <div className="text-xs text-indigo-600">x12 = {formatCurrency(item.amount * 12)}</div>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
              <div className="bg-indigo-50 px-4 py-4 flex justify-between items-center border-t border-indigo-100">
                  <span className="text-sm font-bold text-indigo-900">Total</span>
                  <span className="text-sm font-bold text-indigo-900">{formatCurrency(sectionTotal)}</span>
              </div>
          </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <RenderSection title="Monthly Recurring" items={monthlyItems} type="monthly" />
      <RenderSection title="Yearly Assets & Obligations" items={yearlyItems} type="yearly" />
      
      <div className="bg-indigo-900 text-white rounded-xl p-6 shadow-md text-center mx-1">
        <h3 className="text-lg md:text-xl font-bold mb-2">Total Annual Budget</h3>
        <p className="text-2xl md:text-3xl font-extrabold tracking-tight break-all">{formatCurrency(grandTotal)}</p>
        <p className="text-indigo-200 text-xs md:text-sm mt-1">Sum of (Monthly x 12) + Yearly Allocations</p>
      </div>
    </div>
  );
};

export default BudgetTable;