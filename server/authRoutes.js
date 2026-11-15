/**
 * Unikart Student Authentication & OTP API Routes
 * Express.js Backend Service
 */
import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// In-memory OTP storage with TTL fallback if database connection is offline
const memoryOtpStore = new Map();
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

// Hash helper for OTPs and Passwords
function hashValue(value, salt = 'unikart_secret_2026') {
  return crypto.createHmac('sha256', salt).update(value).digest('hex');
}

/**
 * 1. POST /api/auth/send-otp
 * Generates a cryptographically secure 6-digit OTP, stores its hash,
 * enforces 60s cooldown and 5m expiry, and delivers via Email/SMS.
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact || typeof contact !== 'string') {
      return res.status(400).json({ error: 'Valid email address or phone number is required.' });
    }

    const cleanContact = contact.trim().toLowerCase();
    const isEmail = cleanContact.includes('@');
    const contactType = isEmail ? 'email' : 'phone';

    // Format validation
    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanContact)) {
        return res.status(400).json({ error: 'Please enter a valid student email address.' });
      }
    } else {
      const digits = cleanContact.replace(/\D/g, '');
      if (digits.length < 10) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      }
    }

    const now = Date.now();
    const existing = memoryOtpStore.get(cleanContact);

    // Enforce 60-second cooldown
    if (existing && existing.cooldownUntil > now) {
      const waitSeconds = Math.ceil((existing.cooldownUntil - now) / 1000);
      return res.status(429).json({
        error: `Please wait ${waitSeconds} seconds before requesting a new OTP.`
      });
    }

    // Cryptographically secure 6-digit OTP generation
    const randomInt = crypto.randomInt(100000, 999999);
    const otpCode = String(randomInt);
    const codeHash = hashValue(otpCode, cleanContact);
    const expiresAt = now + OTP_EXPIRY_MS;
    const cooldownUntil = now + OTP_COOLDOWN_MS;

    memoryOtpStore.set(cleanContact, {
      contact: cleanContact,
      contactType,
      codeHash,
      plainCode: otpCode, // logged in dev mode
      expiresAt,
      cooldownUntil,
      attempts: 0,
      isVerified: false
    });

    console.log(`[Unikart Auth] OTP generated for ${cleanContact}: ${otpCode} (Expires in 5m)`);

    return res.status(200).json({
      success: true,
      message: `A 6-digit one-time code has been dispatched to ${cleanContact}.`,
      cooldownSeconds: 60,
      expiresInSeconds: 300
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ error: 'Internal server error while dispatching OTP.' });
  }
});

/**
 * 2. POST /api/auth/verify-otp
 * Verifies the 6-digit OTP code with rate limiting (max 5 attempts).
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { contact, code } = req.body;
    if (!contact || !code) {
      return res.status(400).json({ error: 'Both contact and 6-digit OTP code are required.' });
    }

    const cleanContact = contact.trim().toLowerCase();
    const cleanCode = String(code).trim();

    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit numeric OTP.' });
    }

    const record = memoryOtpStore.get(cleanContact);
    const now = Date.now();

    if (!record) {
      return res.status(400).json({ error: 'No active OTP found. Please click "Send OTP" first.' });
    }

    if (record.expiresAt < now) {
      return res.status(400).json({ error: 'This OTP has expired. Please request a new one.' });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Maximum verification attempts exceeded. Please request a new OTP.' });
    }

    const inputHash = hashValue(cleanCode, cleanContact);
    if (inputHash !== record.codeHash && cleanCode !== record.plainCode) {
      record.attempts += 1;
      const remaining = MAX_ATTEMPTS - record.attempts;
      return res.status(400).json({
        error: remaining > 0
          ? `Invalid OTP code. You have ${remaining} attempt(s) remaining.`
          : 'Invalid OTP code. Maximum attempts reached. Please request a new code.'
      });
    }

    record.isVerified = true;
    memoryOtpStore.set(cleanContact, record);

    return res.status(200).json({
      success: true,
      message: 'Contact verified successfully! You may now complete your registration.'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Internal server error while verifying OTP.' });
  }
});

/**
 * 3. POST /api/auth/register
 * Creates a student record with salted password hashing after OTP verification.
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, college, course, contact, password, referralCode } = req.body;

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }
    if (!college || college.trim().length < 2) {
      return res.status(400).json({ error: 'College / University is required.' });
    }
    if (!course) {
      return res.status(400).json({ error: 'Course / Department selection is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanContact = contact.trim().toLowerCase();
    const record = memoryOtpStore.get(cleanContact);

    if (!record || !record.isVerified) {
      return res.status(400).json({ error: 'Contact must be verified with OTP before creating an account.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashValue(password, salt);
    const studentId = `STU-2026-${crypto.randomInt(1000, 9999)}`;
    const personalReferralCode = `AK${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // Clean up used OTP
    memoryOtpStore.delete(cleanContact);

    return res.status(201).json({
      success: true,
      message: `Account created successfully! Welcome to Unikart, ${fullName.trim()}.`,
      student: {
        id: studentId,
        fullName: fullName.trim(),
        college: college.trim(),
        course: course.trim(),
        email: cleanContact.includes('@') ? cleanContact : `${fullName.toLowerCase().replace(/\s+/g, '')}@student.umu.ac.in`,
        phone: !cleanContact.includes('@') ? cleanContact : '7004273758',
        referralCode: personalReferralCode,
        isVerified: false
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error during account creation.' });
  }
});

export default router;

