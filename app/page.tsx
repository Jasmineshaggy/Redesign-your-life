"use client";
import { createClient, User } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Declare Razorpay
declare global {
  interface Window {
    Razorpay: any;
  }
}

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [chatCount, setChatCount] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<string>('Home');
  const [habits, setHabits] = useState<Record<number, boolean>>({});
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase.from('users').select('chat_count, is_subscribed').eq('id', user.id).single();
        setChatCount(data?.chat_count ?? 0);
        setIsSubscribed(data?.is_subscribed ?? false);
      }
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('users').select('chat_count, is_subscribed').eq('id', session.user.id).single().then(({ data }) => {
          setChatCount(data?.chat_count ?? 0);
          setIsSubscribed(data?.is_subscribed ?? false);
        });
      }
    });

    // Load habits from localStorage
    const savedHabits = localStorage.getItem('habits');
    if (savedHabits) setHabits(JSON.parse(savedHabits));

    return () => {
      authListener.subscription.unsubscribe();
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setChatCount(0);
    setIsSubscribed(false);
  };

  const toggleHabit = (day: number) => {
    const newHabits = { ...habits, [day]: !habits[day] };
    setHabits(newHabits);
    localStorage.setItem('habits', JSON.stringify(newHabits));
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const newMessages: Message[] = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsLoading(true);

    const completedDays = Object.values(habits).filter(Boolean).length;
    const currentDay = Math.max(...Object.keys(habits).map(Number), 1);
    const streak = calculateStreak();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          userId: user?.id,
          currentDay,
          completedDays,
          streak
        })
      });
      const data = await res.json();
      if (data.error === 'FREE_LIMIT_REACHED') {
        setChatMessages([...newMessages, { role: 'assistant', content: 'Free limit reached. Please subscribe to continue chatting.' }]);
      } else {
        setChatMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Error occurred. Try again.' }]);
    }
    setIsLoading(false);
  };

  const calculateStreak = () => {
    let streak = 0;
    for (let i = 100; i >= 1; i--) {
      if (habits[i]) streak++;
      else break;
    }
    return streak;
  };

  const initiatePayment = async () => {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 149 })
    });
    const order = await res.json();

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'Redesign Your Life',
      description: 'Monthly Subscription',
      handler: async (response: any) => {
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: response.razorpay_payment_id,
            order_id: response.razorpay_order_id,
            signature: response.razorpay_signature,
            userId: user!.id
          })
        });
        if (verifyRes.ok) {
          setIsSubscribed(true);
          alert('Payment successful! You are now subscribed.');
        } else {
          alert('Payment verification failed.');
        }
      }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] p-8 rounded-2xl shadow-2xl border border-[#7c3aed]/20 text-center max-w-md w-full">
          <div className="mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#7c3aed] to-[#f59e0b] bg-clip-text text-transparent mb-2">
              Redesign Your Life
            </h1>
            <p className="text-gray-400 text-lg">100-day transformation program with AI coaching</p>
          </div>
          <button
            onClick={loginWithGoogle}
            className="w-full bg-gradient-to-r from-[#7c3aed] to-[#9333ea] hover:from-[#9333ea] hover:to-[#7c3aed] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-[#7c3aed]/25"
          >
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  const completedDays = Object.values(habits).filter(Boolean).length;
  const currentDay = Math.max(...Object.keys(habits).map(Number), 1);
  const streak = calculateStreak();
  const completionPercent = Math.round((completedDays / 100) * 100);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="bg-[#1a1a1a] border-b border-[#7c3aed]/20 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#7c3aed] to-[#f59e0b] bg-clip-text text-transparent">
              Redesign Your Life
            </h1>
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-black px-4 py-2 rounded-full font-semibold shadow-lg">
                🔥 {streak} Day Streak
              </div>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex space-x-2">
            {['Home', 'Chat', 'Progress', 'Profile'].map(tab => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                  currentTab === tab
                    ? 'bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white shadow-lg shadow-[#7c3aed]/25'
                    : 'bg-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#3a3a3a]'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6">
        {currentTab === 'Home' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
                <div className="text-3xl font-bold text-[#7c3aed] mb-2">Day {currentDay}</div>
                <div className="text-gray-400">Current Day</div>
              </div>
              <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
                <div className="text-3xl font-bold text-[#f59e0b] mb-2">{streak}</div>
                <div className="text-gray-400">Day Streak</div>
              </div>
              <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
                <div className="text-3xl font-bold text-[#7c3aed] mb-2">{completionPercent}%</div>
                <div className="text-gray-400">Completed</div>
              </div>
            </div>

            {/* 100-Day Grid */}
            <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
              <h2 className="text-xl font-semibold mb-6 text-center">100-Day Habit Tracker</h2>
              <div className="grid grid-cols-10 gap-3 max-w-2xl mx-auto">
                {Array.from({ length: 100 }, (_, i) => i + 1).map(day => (
                  <button
                    key={day}
                    onClick={() => toggleHabit(day)}
                    className={`aspect-square rounded-lg border-2 transition-all duration-300 ${
                      habits[day]
                        ? 'bg-[#7c3aed] border-[#7c3aed] shadow-lg shadow-[#7c3aed]/25'
                        : day === currentDay
                        ? 'bg-[#f59e0b] border-[#f59e0b] shadow-lg shadow-[#f59e0b]/25 animate-pulse'
                        : 'bg-[#2a2a2a] border-[#3a3a3a] hover:border-[#7c3aed]/50'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${
                      habits[day] || day === currentDay ? 'text-white' : 'text-gray-500'
                    }`}>
                      {day}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentTab === 'Chat' && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#7c3aed]/20 h-[600px] flex flex-col">
            {/* Chat Header */}
            <div className="p-6 border-b border-[#7c3aed]/20">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-[#7c3aed] to-[#9333ea] rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold">Z</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Zara - AI Life Coach</h3>
                  <p className="text-sm text-gray-400">Your personal transformation guide</p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white'
                      : 'bg-[#2a2a2a] text-gray-200 border border-[#7c3aed]/20'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#2a2a2a] px-4 py-3 rounded-2xl border border-[#7c3aed]/20">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-[#7c3aed] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[#7c3aed] rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-[#7c3aed] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Paywall Message */}
            {!isSubscribed && chatCount >= 3 && (
              <div className="mx-6 mb-4 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-black p-4 rounded-xl">
                <p className="font-semibold mb-2">You've used {chatCount} free chats</p>
                <p className="text-sm mb-3">Subscribe for ₹149/month to continue chatting with Zara</p>
                <button
                  onClick={initiatePayment}
                  className="bg-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  Subscribe Now
                </button>
              </div>
            )}

            {/* Chat Input */}
            <div className="p-6 border-t border-[#7c3aed]/20">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChat()}
                  className="flex-1 bg-[#2a2a2a] border border-[#7c3aed]/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]"
                  placeholder="Ask Zara for advice..."
                  disabled={!isSubscribed && chatCount >= 3}
                />
                <button
                  onClick={sendChat}
                  disabled={!isSubscribed && chatCount >= 3}
                  className="bg-gradient-to-r from-[#7c3aed] to-[#9333ea] hover:from-[#9333ea] hover:to-[#7c3aed] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-[#7c3aed]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {currentTab === 'Progress' && (
          <div className="space-y-8">
            {/* Overall Progress */}
            <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
              <h2 className="text-xl font-semibold mb-6">Your Progress</h2>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Overall Completion</span>
                  <span>{completedDays}/100 days</span>
                </div>
                <div className="w-full bg-[#2a2a2a] rounded-full h-4">
                  <div
                    className="bg-gradient-to-r from-[#7c3aed] to-[#9333ea] h-4 rounded-full transition-all duration-500"
                    style={{ width: `${completionPercent}%` }}
                  ></div>
                </div>
                <div className="text-center text-2xl font-bold text-[#7c3aed]">{completionPercent}% Complete</div>
              </div>
            </div>

            {/* Weekly Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 10 }, (_, week) => {
                const weekStart = week * 10 + 1;
                const weekEnd = Math.min((week + 1) * 10, 100);
                const weekCompleted = Array.from({ length: 10 }, (_, i) => weekStart + i)
                  .filter(day => habits[day]).length;
                const weekPercent = Math.round((weekCompleted / 10) * 100);

                return (
                  <div key={week} className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#7c3aed]/20">
                    <h3 className="font-semibold mb-3">Week {week + 1}</h3>
                    <div className="text-sm text-gray-400 mb-2">Days {weekStart}-{weekEnd}</div>
                    <div className="w-full bg-[#2a2a2a] rounded-full h-2 mb-2">
                      <div
                        className="bg-gradient-to-r from-[#f59e0b] to-[#d97706] h-2 rounded-full"
                        style={{ width: `${weekPercent}%` }}
                      ></div>
                    </div>
                    <div className="text-sm">{weekCompleted}/10 days • {weekPercent}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentTab === 'Profile' && (
          <div className="max-w-md mx-auto">
            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-[#7c3aed]/20 text-center">
              {/* Avatar */}
              <div className="w-24 h-24 bg-gradient-to-r from-[#7c3aed] to-[#9333ea] rounded-full mx-auto mb-6 flex items-center justify-center">
                <span className="text-3xl font-bold text-white">
                  {user.email?.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* User Info */}
              <h2 className="text-xl font-semibold mb-2">{user.email}</h2>
              <div className="mb-6">
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                  isSubscribed
                    ? 'bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-black'
                    : 'bg-[#2a2a2a] text-gray-400'
                }`}>
                  {isSubscribed ? 'Premium Member' : 'Free Plan'}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#2a2a2a] p-4 rounded-xl">
                  <div className="text-2xl font-bold text-[#7c3aed]">{chatCount}</div>
                  <div className="text-sm text-gray-400">Chats Used</div>
                </div>
                <div className="bg-[#2a2a2a] p-4 rounded-xl">
                  <div className="text-2xl font-bold text-[#f59e0b]">{completedDays}</div>
                  <div className="text-sm text-gray-400">Days Completed</div>
                </div>
              </div>

              {/* Subscribe Button */}
              {!isSubscribed && (
                <button
                  onClick={initiatePayment}
                  className="w-full bg-gradient-to-r from-[#7c3aed] to-[#9333ea] hover:from-[#9333ea] hover:to-[#7c3aed] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-[#7c3aed]/25 mb-4"
                >
                  Upgrade to Premium - ₹149/month
                </button>
              )}

              {/* Logout */}
              <button
                onClick={logout}
                className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-400 hover:text-white py-3 px-6 rounded-xl transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

