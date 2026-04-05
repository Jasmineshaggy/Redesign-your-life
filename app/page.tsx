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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Redesign Your Life</h1>
          <p className="text-gray-600 mb-6">100-day transformation program with AI coaching</p>
          <button onClick={loginWithGoogle} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  const completedDays = Object.values(habits).filter(Boolean).length;
  const currentDay = Math.max(...Object.keys(habits).map(Number), 1);
  const streak = calculateStreak();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Redesign Your Life</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Day {currentDay} • Streak: {streak}</span>
              <button onClick={logout} className="text-gray-600 hover:text-gray-900">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['Home', 'Chat', 'Progress', 'Profile'].map(tab => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  currentTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {currentTab === 'Home' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">100-Day Habit Tracker</h2>
            <div className="grid grid-cols-10 gap-2">
              {Array.from({ length: 100 }, (_, i) => i + 1).map(day => (
                <button
                  key={day}
                  onClick={() => toggleHabit(day)}
                  className={`w-10 h-10 rounded ${
                    habits[day] ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'Chat' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">AI Life Coach</h2>
            {!isSubscribed && chatCount >= 3 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <p className="text-yellow-800">You've used {chatCount} free chats. Subscribe for ₹149/month to continue.</p>
                <button onClick={initiatePayment} className="mt-2 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700">
                  Subscribe Now
                </button>
              </div>
            )}
            <div className="bg-white rounded-lg shadow p-4 h-96 overflow-y-auto mb-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`mb-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <span className={`inline-block p-2 rounded ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    {msg.content}
                  </span>
                </div>
              ))}
              {isLoading && <div className="text-center">Typing...</div>}
            </div>
            <div className="flex">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChat()}
                className="flex-1 border rounded-l px-3 py-2"
                placeholder="Ask your AI coach..."
                disabled={!isSubscribed && chatCount >= 3}
              />
              <button onClick={sendChat} className="bg-blue-600 text-white px-4 py-2 rounded-r hover:bg-blue-700" disabled={!isSubscribed && chatCount >= 3}>
                Send
              </button>
            </div>
          </div>
        )}

        {currentTab === 'Progress' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Completed Days</h3>
                <p className="text-2xl">{completedDays}/100</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Current Streak</h3>
                <p className="text-2xl">{streak} days</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Chat Count</h3>
                <p className="text-2xl">{chatCount}</p>
              </div>
            </div>
          </div>
        )}

        {currentTab === 'Profile' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Profile</h2>
            <div className="bg-white p-4 rounded-lg shadow">
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Subscription:</strong> {isSubscribed ? 'Active' : 'Inactive'}</p>
              <p><strong>Chat Count:</strong> {chatCount}</p>
              {!isSubscribed && (
                <button onClick={initiatePayment} className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                  Subscribe for ₹149/month
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

