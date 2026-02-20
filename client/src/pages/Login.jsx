import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/apple';
import { spring } from '../utils/animations';

// Showcase donut chart SVG
function DonutChart() {
  const segments = [
    { percent: 45, color: 'var(--chart-primary)', label: 'Stocks' },
    { percent: 25, color: 'var(--system-green)', label: 'FD' },
    { percent: 18, color: 'var(--system-amber)', label: 'Gold' },
    { percent: 12, color: 'var(--system-purple)', label: 'Other' },
  ];

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {segments.map((seg, i) => {
        const dashLength = (seg.percent / 100) * circumference;
        const dashOffset = -offset;
        offset += dashLength;
        return (
          <circle
            key={i}
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        );
      })}
      <text x="50" y="46" textAnchor="middle" className="text-[17px] font-bold" fill="var(--label-primary)" style={{ fontFamily: 'var(--font-display)' }}>45%</text>
      <text x="50" y="60" textAnchor="middle" className="text-[8px]" fill="var(--label-tertiary)">Stocks</text>
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-[var(--bg-page)] flex relative overflow-hidden">
      {/* Left Panel - Showcase */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative flex-col justify-between p-10 xl:p-14">
        {/* Subtle background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-page)] via-[var(--bg-tertiary)] to-[var(--chart-primary)]/[0.06]" />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-[var(--chart-primary)]/[0.05] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-[var(--system-green)]/[0.04] rounded-full blur-3xl" />

        {/* Top - Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.1 }}
          className="flex items-center gap-3 relative z-10"
        >
          <div className="w-10 h-10 bg-[var(--sidebar-active)] rounded-xl flex items-center justify-center shadow-md shadow-[var(--sidebar-active)]/15">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <span className="text-[18px] font-bold text-[var(--label-primary)] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Wealth Tracker
          </span>
        </motion.div>

        {/* Center - Showcase Cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring.gentle, delay: 0.3 }}
          className="relative z-10 flex-1 flex items-center justify-center py-10"
        >
          <div className="w-full max-w-[340px]">
            {/* Portfolio Value Card - Hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.4 }}
              className="bg-[var(--bg-primary)] rounded-2xl shadow-[var(--shadow-floating)] border border-[var(--separator-opaque)]/40 p-6 mb-3"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-[var(--chart-primary)]/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[var(--chart-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <span className="text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Portfolio Value</span>
              </div>
              <p className="text-[32px] font-bold text-[var(--label-primary)] tracking-tight tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                ₹24,50,000
              </p>
              <p className="text-[15px] font-medium text-[var(--system-green)] mt-1 tabular-nums">
                +₹4.07L (+12.6%)
              </p>
            </motion.div>

            {/* Bottom Cards Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Donut Chart Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: 0.5 }}
                className="bg-[var(--bg-primary)] rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--separator-opaque)]/40 p-4 flex items-center justify-center"
              >
                <div className="w-24 h-24">
                  <DonutChart />
                </div>
              </motion.div>

              {/* Right Column - XIRR + Total Assets */}
              <div className="flex flex-col gap-3">
                {/* XIRR Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.55 }}
                  className="bg-[var(--bg-primary)] rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--separator-opaque)]/40 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--system-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                    <span className="text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">XIRR</span>
                  </div>
                  <p className="text-[20px] font-bold text-[var(--system-green)] tabular-nums mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                    +18.2%
                  </p>
                </motion.div>

                {/* Total Assets Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.6 }}
                  className="bg-[var(--bg-primary)] rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--separator-opaque)]/40 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--system-purple)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span className="text-[12px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wider">Total Assets</span>
                  </div>
                  <p className="text-[20px] font-bold text-[var(--label-primary)] tabular-nums mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                    24
                  </p>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom - Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.7 }}
          className="relative z-10"
        >
          <h2 className="text-[28px] font-bold text-[var(--label-primary)] tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Know your worth!
          </h2>
          <p className="text-[16px] text-[var(--label-tertiary)] leading-relaxed">
            All your investments, one place.<br />
            Track, analyze, and grow with confidence.
          </p>
        </motion.div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 relative">
        {/* Mobile-only background decorations */}
        <div className="lg:hidden absolute inset-0 bg-gradient-to-br from-[var(--bg-page)] via-[var(--bg-page)] to-[var(--chart-primary)]/[0.06]" />
        <div className="lg:hidden absolute top-1/4 -right-32 w-96 h-96 bg-[var(--chart-primary)]/[0.04] rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="w-full max-w-[420px] relative z-10"
        >
          {/* Logo + Brand - Mobile only */}
          <div className="text-center mb-10 lg:mb-8">
            <div className="lg:hidden w-14 h-14 bg-[var(--sidebar-active)] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[var(--sidebar-active)]/15">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <h1 className="text-[32px] font-bold text-[var(--label-primary)] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Welcome back
            </h1>
            <p className="text-[16px] text-[var(--label-tertiary)] mt-2">Sign in to manage your portfolio</p>
          </div>

          {/* Form Card */}
          <div className="bg-[var(--bg-primary)] rounded-2xl shadow-[var(--shadow-floating)] border border-[var(--separator-opaque)]/40 p-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring.snappy}
                    className="bg-[var(--system-red)]/8 text-[var(--system-red)] px-4 py-3 rounded-xl text-[15px] flex items-center gap-2"
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

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[38px] p-1 text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="flex justify-end -mt-1">
                <button type="button" className="text-[14px] text-[var(--chart-primary)] hover:underline font-medium">
                  Forgot password?
                </button>
              </div>

              <div className="pt-1">
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
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-[15px] text-[var(--label-tertiary)] mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-[var(--chart-primary)] hover:underline">
              Create one
            </Link>
          </p>

          {/* Footer */}
          <div className="text-center mt-10">
            <p className="text-[13px] text-[var(--label-quaternary)]">
              © 2026 Wealth Tracker · Built by <span className="font-medium text-[var(--label-tertiary)]">Mohamed Rafiqdeen S</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
