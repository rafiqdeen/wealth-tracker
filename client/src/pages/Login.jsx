import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/apple';
import { spring } from '../utils/animations';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex">
      {/* Left Panel - Showcase (40%) */}
      <div className="hidden lg:flex lg:w-[40%] flex-col p-10 relative overflow-hidden bg-gradient-to-br from-[#E8EDF5] via-[#F0F4F8] to-[#E1E8F0]">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.4]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(79, 125, 243, 0.15) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }} />

        {/* Decorative gradient orbs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#4F7DF3]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-80 h-80 bg-[#22C55E]/8 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="flex items-center gap-3 mb-16 relative z-10">
          <div className="w-10 h-10 bg-[var(--sidebar-active)] rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <span className="text-[20px] font-semibold text-[var(--label-primary)]">Wealth Tracker</span>
        </div>

        {/* Floating Cards Container */}
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="grid grid-cols-2 gap-4 w-full max-w-[380px]">
            {/* Portfolio Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="col-span-2 bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-[#EEF2FF] rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#4F7DF3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Portfolio Value</span>
              </div>
              <p className="text-[32px] font-bold text-[var(--label-primary)]">
                <span className="text-[#4F7DF3]">₹</span>24,50,000
              </p>
              <p className="text-sm text-[var(--system-green)] mt-1">+₹4.07 L (+12.6%)</p>
            </motion.div>

            {/* Allocation Pie Chart Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 border border-gray-100"
            >
              {/* Donut Chart */}
              <div className="relative w-[120px] h-[120px] mx-auto">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#4F7DF3" strokeWidth="10" strokeDasharray="113 251" strokeLinecap="round" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#22C55E" strokeWidth="10" strokeDasharray="75 251" strokeDashoffset="-113" strokeLinecap="round" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#F59E0B" strokeWidth="10" strokeDasharray="38 251" strokeDashoffset="-188" strokeLinecap="round" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#8B5CF6" strokeWidth="10" strokeDasharray="25 251" strokeDashoffset="-226" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-[var(--label-primary)]">45%</span>
                  <span className="text-[10px] text-gray-500">Stocks</span>
                </div>
              </div>
            </motion.div>

            {/* Right Column - Stacked Cards */}
            <div className="flex flex-col gap-4">
              {/* XIRR Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#ECFDF5] rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">XIRR</p>
                    <p className="text-xl font-bold text-[var(--system-green)]">+18.2%</p>
                  </div>
                </div>
              </motion.div>

              {/* Total Assets Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Assets</p>
                    <p className="text-xl font-bold text-[var(--label-primary)]">24</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-auto relative z-10"
        >
          <h2 className="text-[28px] font-bold text-[var(--label-primary)] mb-2">Know your worth !</h2>
          <p className="text-[15px] text-gray-500 leading-relaxed">
            All your investments, one place.<br />
            Track, analyze, and grow with confidence.
          </p>
        </motion.div>

        {/* Curved edge connector */}
        <div className="absolute right-0 top-0 bottom-0 w-8 overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-white rounded-l-[40px]" />
        </div>
      </div>

      {/* Right Panel - Login Form (60%) */}
      <div className="w-full lg:w-[60%] bg-white flex items-center justify-center p-8 lg:p-12 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
          className="w-full max-w-[400px]"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[var(--sidebar-active)] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <span className="text-[20px] font-semibold text-[var(--label-primary)]">Wealth Tracker</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[var(--label-primary)]">Welcome back!</h1>
            <p className="text-[15px] text-gray-500 mt-2">Sign in to manage your portfolio</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring.snappy}
                  className="bg-red-50 text-[var(--system-red)] px-4 py-3 rounded-xl text-[14px] flex items-center gap-2"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="filled"
                size="lg"
                fullWidth
                loading={loading}
              >
                Sign In
              </Button>
            </div>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-[15px] text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-[#4F7DF3] hover:underline">
              Sign Up
            </Link>
          </p>

          {/* Footer */}
          <div className="text-center mt-12">
            <p className="text-[12px] text-gray-400">
              © 2026 Wealth Tracker. All rights reserved.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Developed by <span className="font-medium text-gray-500">Mohamed Rafiqdeen S</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
