import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { BottomNav, NavTab } from './components/navigation/BottomNav';
import { StartView } from './components/views/StartView';
import { CalendarView } from './components/views/CalendarView';
import { StudentsView } from './components/views/StudentsView';
import { FinanceView } from './components/views/FinanceView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { PinLock } from './components/common/PinLock';
import { IconCalendar, IconFinance, IconStudents } from './components/common/Icons';

export const App: React.FC = () => {
  const { isReady, isLocked, unlockWithPin } = useApp();
  const [activeTab, setActiveTab] = useState<NavTab>('start');
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Service Worker update detection (A6)
  useEffect(() => {
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw-update-available', handleUpdate);
    return () => window.removeEventListener('sw-update-available', handleUpdate);
  }, []);

  // Deep linking handler from URL hash (#dzis, #dodaj-lekcje, #dodaj-wplate)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#dzis') {
        setActiveTab('start');
      } else if (hash === '#grafik' || hash === '#dodaj-lekcje') {
        setActiveTab('calendar');
      } else if (hash === '#uczniowie') {
        setActiveTab('students');
      } else if (hash === '#finanse' || hash === '#dodaj-wplate') {
        setActiveTab('finance');
      } else if (hash === '#raporty') {
        setActiveTab('reports');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (!isReady) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>Tutor Manager</div>
        <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>Wczytywanie bazy danych...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Service Worker Update Banner (A6) */}
      {updateAvailable && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1000,
            background: 'var(--ios-blue)',
            color: '#fff',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(0, 122, 255, 0.4)'
          }}
        >
          <span>✨ Dostępna nowa wersja aplikacji</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#fff',
              color: 'var(--ios-blue)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Odśwież
          </button>
        </div>
      )}

      {/* PIN Security Overlay */}
      {isLocked && <PinLock onUnlock={unlockWithPin} />}

      {/* Main Tab Views */}
      <main style={{ flex: 1 }}>
        {activeTab === 'start' && (
          <StartView
            onOpenSettings={() => setShowSettings(true)}
            onOpenCalendar={() => setActiveTab('calendar')}
            onOpenStudents={() => setActiveTab('students')}
          />
        )}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'students' && <StudentsView />}
        {activeTab === 'finance' && <FinanceView />}
        {activeTab === 'reports' && <ReportsView />}
      </main>

      {/* Floating Add & Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={tab => {
          setActiveTab(tab);
          window.location.hash = `#${tab}`;
        }}
        onQuickAdd={() => setShowQuickAddModal(true)}
      />

      {/* Quick Add Bottom Sheet Modal */}
      {showQuickAddModal && (
        <div className="ios-modal-overlay" onClick={() => setShowQuickAddModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Szybka akcja</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="ios-btn ios-btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '14px 16px', fontSize: 15 }}
                onClick={() => {
                  setShowQuickAddModal(false);
                  setActiveTab('calendar');
                }}
              >
                <IconCalendar size={22} color="var(--ios-blue)" /> Zaplanuj nową lekcję
              </button>

              <button
                className="ios-btn ios-btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '14px 16px', fontSize: 15 }}
                onClick={() => {
                  setShowQuickAddModal(false);
                  setActiveTab('students');
                }}
              >
                <IconFinance size={22} color="var(--ios-green)" /> Zarejestruj wpłatę
              </button>

              <button
                className="ios-btn ios-btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '14px 16px', fontSize: 15 }}
                onClick={() => {
                  setShowQuickAddModal(false);
                  setActiveTab('students');
                }}
              >
                <IconStudents size={22} color="var(--ios-purple)" /> Dodaj nowego ucznia
              </button>

              <button
                className="ios-btn"
                style={{ backgroundColor: 'transparent', color: 'var(--ios-text-secondary)', marginTop: 6 }}
                onClick={() => setShowQuickAddModal(false)}
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--ios-system-bg)',
            zIndex: 1000,
            overflowY: 'auto'
          }}
        >
          <SettingsView onClose={() => setShowSettings(false)} />
        </div>
      )}
    </div>
  );
};
