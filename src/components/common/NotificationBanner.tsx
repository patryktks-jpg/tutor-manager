import React from 'react';
import { useApp } from '../../context/AppContext';
import { IconAlertTriangle, IconClock, IconRefresh } from './Icons';

export const NotificationBanner: React.FC = () => {
  const { limitStatus, unconfirmedLessons, offlineQueueCount, syncNow, syncStatus } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {/* Critical CEIDG Registration Alert */}
      {limitStatus.isExceeded && (
        <div
          style={{
            backgroundColor: 'rgba(255, 59, 48, 0.12)',
            border: '1.5px solid var(--ios-red)',
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}
        >
          <div style={{ color: 'var(--ios-red)', flexShrink: 0, marginTop: 2 }}>
            <IconAlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ios-red)', marginBottom: 2 }}>
              KRYTYCZNE: Przekroczono limit kwartalny!
            </div>
            <div style={{ fontSize: 13, color: 'var(--ios-text-primary)', lineHeight: 1.4 }}>
              Działalność stała się działalnością gospodarczą od dnia przekroczenia ({limitStatus.exceededOn}).
              Termin na złożenie wniosku do <strong>CEIDG: {limitStatus.ceidgDeadline}</strong> (7 dni roboczych).
            </div>
          </div>
        </div>
      )}

      {/* Unconfirmed past lessons banner */}
      {unconfirmedLessons.length > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(255, 149, 0, 0.12)',
            border: '1px solid var(--ios-amber)',
            borderRadius: 14,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconClock size={20} color="var(--ios-amber)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {unconfirmedLessons.length} lekcji po terminie do potwierdzenia
            </span>
          </div>
        </div>
      )}

      {/* Offline Queue Badge & Sync trigger */}
      {offlineQueueCount > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(0, 122, 255, 0.1)',
            border: '1px solid var(--ios-blue)',
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: 'var(--ios-blue)',
                display: 'inline-block'
              }}
            />
            <span>Kolejka offline: <strong>{offlineQueueCount}</strong> zmian do wysłania</span>
          </div>
          <button
            onClick={() => syncNow()}
            disabled={syncStatus.isSyncing}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ios-blue)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <IconRefresh size={14} className={syncStatus.isSyncing ? 'animate-spin' : ''} />
            {syncStatus.isSyncing ? 'Wysyłanie...' : 'Wyślij teraz'}
          </button>
        </div>
      )}
    </div>
  );
};
