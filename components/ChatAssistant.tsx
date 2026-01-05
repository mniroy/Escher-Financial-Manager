import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Tool } from "@google/genai";
import { MessageCircle, Send, X, Bot, User, Sparkles, ChevronDown } from 'lucide-react';
import { BudgetCategory, Expense } from '../types';

interface ChatAssistantProps {
  onSaveExpense: (expense: Expense) => void;
}

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ onSaveExpense }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'model', text: "Hi! I'm Papion. Tell me what you spent (e.g., 'Lunch 50k', 'Taxi 25000'), and I'll log it for you." }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Initialize Chat Session
  useEffect(() => {
    if (!process.env.API_KEY) return;

    const initChat = async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const logExpenseTool: FunctionDeclaration = {
        name: "logExpense",
        description: "Logs a financial expense. Use this when the user mentions spending money.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            amount: { 
              type: Type.NUMBER, 
              description: "The numeric amount spent. If user says '50k', convert to 50000. If currency is not specified, assume user's local currency." 
            },
            category: {
              type: Type.STRING,
              enum: Object.values(BudgetCategory),
              description: "The budget category."
            },
            description: { 
              type: Type.STRING, 
              description: "Short description of the item or service." 
            },
            date: { 
              type: Type.STRING, 
              description: "ISO 8601 date string (YYYY-MM-DD). Use today's date if not specified." 
            },
          },
          required: ["amount", "category", "description", "date"],
        },
      };

      const tools: Tool[] = [{ functionDeclarations: [logExpenseTool] }];

      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: `You are Papion, an intelligent financial assistant for the Escher Financial Manager app. 
          Your role is to help users log their expenses quickly through natural language.
          Today's date is ${new Date().toISOString().split('T')[0]}.
          
          Guidelines:
          1. If the user states an expense, extract the details and call the 'logExpense' tool immediately.
          2. If the category is ambiguous, make a best guess based on the description (e.g. 'Latte' -> Food, 'Uber' -> Transportation).
          3. If the amount is missing, ask for it.
          4. Be concise, friendly, and professional.
          5. After logging, confirm briefly.
          
          Valid Categories: ${Object.values(BudgetCategory).join(', ')}.`,
          tools: tools,
        }
      });
    };

    initChat();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !chatRef.current) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: userText }]);
    setIsTyping(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userText });
      const text = response.text;
      
      if (text) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: text }]);
      }

      // Handle Function Calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        
        for (const call of functionCalls) {
          if (call.name === 'logExpense') {
             const args = call.args as any;
             
             // Construct Expense Object
             const newExpense: Expense = {
               id: crypto.randomUUID(),
               amount: args.amount,
               category: args.category as BudgetCategory,
               description: args.description,
               date: args.date,
             };

             // Save to App State
             onSaveExpense(newExpense);

             // Provide feedback
             setMessages(prev => [...prev, { 
               id: crypto.randomUUID(), 
               role: 'system', 
               text: `✅ Logged: ${args.description} (${args.category}) - ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(args.amount)}` 
             }]);

             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: { result: "Expense logged successfully." },
                 id: call.id
               }
             });
          }
        }

        // Send function results back to model to complete the turn
        if (functionResponses.length > 0) {
           const nextResponse = await chatRef.current.sendMessage(functionResponses);
           if (nextResponse.text) {
             setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: nextResponse.text }]);
           }
        }
      }

    } catch (error) {
      console.error("Chat Error", error);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-xl transition-all duration-300 transform hover:scale-105 ${
          isOpen ? 'bg-red-500 rotate-90' : 'bg-indigo-600'
        } text-white`}
        aria-label="Toggle Chat Assistant"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 md:right-6 w-[90vw] md:w-96 h-[500px] max-h-[70vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-100 animate-in slide-in-from-bottom-10 fade-in duration-300">
          
          {/* Header */}
          <div className="bg-indigo-600 p-4 flex items-center gap-3 shadow-md">
            <div className="bg-white/20 p-2 rounded-full">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h3 className="font-bold text-white">Papion</h3>
              <p className="text-indigo-200 text-xs">AI Financial Assistant</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="ml-auto text-white/80 hover:text-white"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : msg.role === 'system'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 w-full text-center'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                  }`}
                >
                  {msg.role === 'model' && (
                     <Bot className="w-4 h-4 mb-1 text-indigo-500 inline-block mr-2" />
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Spent 50k on Coffee..."
                className="flex-grow bg-gray-100 text-gray-900 rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-full transition-colors shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatAssistant;