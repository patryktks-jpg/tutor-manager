import React, { useState, useEffect } from 'react';
import { IconLock } from './Icons';
import { useApp } from '../../context/AppContext';

interface PinLockProps {
  onUnlock: (pin: string) => Promise<boolean> | boolean;
}

export const PinLock: React.FC<PinLockProps> = ({ onUnlock }) => {
  const { settings } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [remainingLockout, setRemainingLockout] = useState(0);

  // Check lockout countdown
  useEffect(() => {
    const checkLockout = () => {
      if (settings.lockout_until) {
        const remaining = Math.ceil((new Date(settings.lockout_until).getTime() - Date.now()) / 1000);
        if (remaining > 0) {
          setRemainingLockout(remaining);
          return;
        }
      }
      setRemainingLockout(0);
    };

    checkLockout();
    const timer = setInterval(checkLockout, 1000);
    return () => clearInterval(timer);
  }, [settings.lockout_until]);

  const submitPin = async (codeToTest: string) => {
    if (remainingLockout > 0) return;
    const success = await onUnlock(codeToTest);
    if (!success) {
      setError(true);
      setErrorMessage(
        settings.failed_pin_attempts && settings.failed_pin_attempts >= 4
          ? 'Zbyt wiele błędnych prób. Blokada!'
          : 'Nieprawidłowy kod PIN'
      );
      setTimeout(() => {
        setPin('');
        setError(false);
        setErrorMessage('');
      }, 700);
    }
  };

  const handleDigit = async (digit: string) => {
    if (remainingLockout > 0) return;
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 6) {
        await submitPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (remainingLockout > 0) return;
    setPin(prev => prev.slice(0, -1));
    setError(false);
    setErrorMessage('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--ios-system-bg)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: remainingLockout > 0 ? 'rgba(255, 59, 48, 0.15)' : 'var(--ios-card-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }}
        >
          <IconLock size={32} color={remainingLockout > 0 ? 'var(--ios-red)' : 'var(--ios-blue)'} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tutor Manager</h2>
        {remainingLockout > 0 ? (
          <p style={{ fontSize: 14, color: 'var(--ios-red)', fontWeight: 600 }}>
            Zbyt wiele błędnych prób. Odczekaj {remainingLockout} s
          </p>
        ) : (
          <p style={{ fontSize: 14, color: errorMessage ? 'var(--ios-red)' : 'var(--ios-text-secondary)' }}>
            {errorMessage || 'Wprowadź kod PIN (4-6 cyfr)'}
          </p>
        )}
      </div>

      {/* PIN Dots (supports up to 6 digits) */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 36,
          animation: error ? 'shake 0.4s ease-in-out' : 'none'
        }}
      >
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              border: `2px solid ${error ? 'var(--ios-red)' : 'var(--ios-blue)'}`,
              backgroundColor: i < pin.length ? (error ? 'var(--ios-red)' : 'var(--ios-blue)') : 'transparent',
              transition: 'all 0.15s ease'
            }}
          />
        ))}
      </div>

      {/* Keypad */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          width: '100%',
          maxWidth: 280,
          opacity: remainingLockout > 0 ? 0.4 : 1,
          pointerEvents: remainingLockout > 0 ? 'none' : 'auto'
        }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button
            key={d}
            onClick={() => handleDigit(d)}
            style={{
              height: 72,
              borderRadius: 36,
              border: 'none',
              backgroundColor: 'var(--ios-card-bg)',
              color: 'var(--ios-text-primary)',
              fontSize: 26,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
            }}
          >
            {d}
          </button>
        ))}

        {/* OK / Unlock Button for 4-5 digit PINs */}
        <button
          onClick={() => submitPin(pin)}
          disabled={pin.length < 4}
          style={{
            height: 72,
            borderRadius: 36,
            border: 'none',
            backgroundColor: pin.length >= 4 ? 'var(--ios-blue)' : 'transparent',
            color: pin.length >= 4 ? '#ffffff' : 'transparent',
            fontSize: 16,
            fontWeight: 700,
            cursor: pin.length >= 4 ? 'pointer' : 'default',
            boxShadow: pin.length >= 4 ? '0 2px 8px rgba(0, 122, 255, 0.3)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          OK
        </button>

        <button
          onClick={() => handleDigit('0')}
          style={{
            height: 72,
            borderRadius: 36,
            border: 'none',
            backgroundColor: 'var(--ios-card-bg)',
            color: 'var(--ios-text-primary)',
            fontSize: 26,
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
          }}
        >
          0
        </button>

        <button
          onClick={handleDelete}
          style={{
            height: 72,
            borderRadius: 36,
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--ios-text-secondary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Usuń
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
      `}</style>
    </div>
  );
};
