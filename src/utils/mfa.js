const crypto = require('crypto');

/**
 * Standard RFC 4648 Base32 alphabet for TOTP
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a buffer to RFC 4648 Base32 string (without padding)
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode an RFC 4648 Base32 string to a Buffer
 * @param {string} input
 * @returns {Buffer}
 */
function base32Decode(input) {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleanInput[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a cryptographically secure Base32 secret for TOTP (160-bit standard)
 * @returns {string}
 */
function generateMfaSecret() {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * Compute RFC 6238 TOTP code for a secret at a given counter step
 * @param {string} secret - Base32 encoded secret
 * @param {number} counter - 8-byte counter step
 * @returns {string} - 6-digit TOTP string
 */
function computeTotpCode(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Generate the current TOTP for a given secret
 * @param {string} secret
 * @param {number} [timeMs=Date.now()]
 * @param {number} [stepSeconds=30]
 * @returns {string}
 */
function generateTotp(secret, timeMs = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return computeTotpCode(secret, counter);
}

/**
 * Verify a 6-digit TOTP token against a secret with window tolerance
 * @param {string} token - 6-digit user input
 * @param {string} secret - Base32 encoded secret
 * @param {number} [window=1] - Tolerance window (+/- steps)
 * @param {number} [timeMs=Date.now()]
 * @param {number} [stepSeconds=30]
 * @returns {boolean}
 */
function verifyTotp(token, secret, window = 1, timeMs = Date.now(), stepSeconds = 30) {
  if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token.trim())) {
    return false;
  }

  const cleanToken = token.trim();
  const currentStep = Math.floor(timeMs / 1000 / stepSeconds);

  try {
    for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
      const step = currentStep + errorWindow;
      const expectedCode = computeTotpCode(secret, step);

      // Constant time comparison to prevent timing side channels
      if (
        cleanToken.length === expectedCode.length &&
        crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expectedCode))
      ) {
        return true;
      }
    }
  } catch (err) {
    return false;
  }

  return false;
}

/**
 * Hash a backup code using SHA-256
 * @param {string} code
 * @returns {string}
 */
function hashBackupCode(code) {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate 8 emergency one-time backup recovery codes
 * @param {number} [count=8]
 * @returns {{ plainCodes: string[], hashedCodes: string[] }}
 */
function generateBackupCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`; // e.g. "A1B2-C3D4"

    plainCodes.push(code);
    hashedCodes.push(hashBackupCode(code));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verify and consume a single-use backup recovery code
 * @param {string} inputCode
 * @param {string[]} storedHashedCodes
 * @returns {{ isValid: boolean, remainingCodes: string[] }}
 */
function verifyAndConsumeBackupCode(inputCode, storedHashedCodes = []) {
  if (!inputCode || !Array.isArray(storedHashedCodes) || storedHashedCodes.length === 0) {
    return { isValid: false, remainingCodes: storedHashedCodes };
  }

  const inputHash = hashBackupCode(inputCode);
  const codeIndex = storedHashedCodes.findIndex((storedHash) => {
    return (
      storedHash.length === inputHash.length &&
      crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash))
    );
  });

  if (codeIndex === -1) {
    return { isValid: false, remainingCodes: storedHashedCodes };
  }

  // Consume code (single-use)
  const remainingCodes = [
    ...storedHashedCodes.slice(0, codeIndex),
    ...storedHashedCodes.slice(codeIndex + 1),
  ];

  return { isValid: true, remainingCodes };
}

/**
 * Build standard otpauth URI for QR codes and authenticator apps
 * @param {string} email
 * @param {string} secret
 * @param {string} [issuer='Amrutam Telemedicine']
 * @returns {string}
 */
function getOtpAuthUrl(email, secret, issuer = 'Amrutam Telemedicine') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  base32Encode,
  base32Decode,
  generateMfaSecret,
  generateTotp,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  getOtpAuthUrl,
};
