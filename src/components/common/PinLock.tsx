import React, { useState } from 'react';
import { IconLock } from './Icons';

interface PinLockProps {
  onUnlock: (pin: string) => boolean;
  biometricsAvailable?: boolean;
}

export const PinLock: React.FC<PinLockProps> = ({ onUnlock, biometricsAvailable = true }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        const success = onUnlock(nextPin);
        if (!success) {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 600);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleBiometricMock = () => {
    // Spec mentions passkey / Face ID webauthn simulation
    onUnlock('1234');
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
            backgroundColor: 'var(--ios-card-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }}
        >
          <IconLock size={32} color="var(--ios-blue)" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tutor Manager</h2>
        <p style={{ fontSize: 14, color: 'var(--ios-text-secondary)' }}>Wprowadź 4-cyfrowy kod PIN</p>
      </div>

      {/* PIN Dots */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 36,
          animation: error ? 'shake 0.4s ease-in-out' : 'none'
        }}
      >
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
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
          maxWidth: 280
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

        {biometricsAvailable ? (
          <button
            onClick={handleBiometricMock}
            style={{
              height: 72,
              borderRadius: 36,
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--ios-blue)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Face ID
          </button>
        ) : <div />}

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
