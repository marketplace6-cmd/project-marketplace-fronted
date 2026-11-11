import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldAlert,
  LoaderCircle,
  UserCheck
} from 'lucide-react';
import { AdminAuthAPI, AdminAuthError } from '../adminAuthService';

interface AdminSecurityPageProps {
  adminId: string;
  accessToken: string;
  onSessionExpired: () => void;
}

export default function AdminSecurityPage({
  adminId,
  accessToken,
  onSessionExpired
}: AdminSecurityPageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Password rules validation
  const hasMinLength = newPassword.length >= 12;
  const hasLower = /[a-z]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const isPasswordValid =
    hasMinLength && hasLower && hasUpper && hasNumber && hasSpecial && passwordsMatch;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isPasswordValid) {
      setErrorMessage(
        'Please ensure the new password satisfies all security requirements and passwords match.'
      );
      return;
    }

    setLoading(true);
    try {
      await AdminAuthAPI.changePassword(newPassword, accessToken);
      setSuccessMessage('Admin password updated successfully! Your new password is now active.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof AdminAuthError && err.status === 401) {
        onSessionExpired();
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to update password. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Admin Profile & Security</h1>
        <p className="mt-1 text-xs text-slate-500">
          Manage administrator account credentials, credentials security, and update your password.
        </p>
      </div>

      {/* Account Info Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-indigo-600" /> Account Details
        </h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-500 block text-[11px] font-medium">Admin User ID</span>
            <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">
              {adminId || '20232027'}
            </span>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-500 block text-[11px] font-medium">Assigned Role</span>
            <span className="font-semibold text-indigo-700 text-sm mt-0.5 block">
              Super Administrator
            </span>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="text-slate-500 block text-[11px] font-medium">Session Status</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 text-sm mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Authenticated
            </span>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Change Admin Password</h2>
              <p className="text-xs text-slate-500">
                Update the password used to access the administrator portal.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" /> High Security
          </span>
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xl">
          {/* Current Password */}
          <div>
            <label
              htmlFor="current-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Current Password (Optional if initial login)
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="new-admin-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="new-admin-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 12 characters with upper, lower, number, symbol"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="confirm-admin-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-admin-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-slate-700 block">
              Password Security Requirements:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div
                className={`flex items-center gap-1.5 ${
                  hasMinLength ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                At least 12 characters
              </div>
              <div
                className={`flex items-center gap-1.5 ${
                  hasUpper ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${hasUpper ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                At least 1 uppercase letter (A-Z)
              </div>
              <div
                className={`flex items-center gap-1.5 ${
                  hasLower ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${hasLower ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                At least 1 lowercase letter (a-z)
              </div>
              <div
                className={`flex items-center gap-1.5 ${
                  hasNumber ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${hasNumber ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                At least 1 number (0-9)
              </div>
              <div
                className={`flex items-center gap-1.5 ${
                  hasSpecial ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${hasSpecial ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                At least 1 special symbol (!@#$...)
              </div>
              <div
                className={`flex items-center gap-1.5 ${
                  passwordsMatch ? 'text-emerald-700 font-medium' : 'text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                Passwords match
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !isPasswordValid}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" /> Updating Password...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" /> Save New Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

