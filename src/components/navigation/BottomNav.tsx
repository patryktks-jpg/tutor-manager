import React from 'react';
import { IconStart, IconCalendar, IconStudents, IconFinance, IconReports, IconPlus } from '../common/Icons';

export type NavTab = 'start' | 'calendar' | 'students' | 'finance' | 'reports';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, onQuickAdd }) => {
  const tabs = [
    { id: 'start' as NavTab, label: 'Start', icon: IconStart },
    { id: 'calendar' as NavTab, label: 'Grafik', icon: IconCalendar },
    { id: 'students' as NavTab, label: 'Uczniowie', icon: IconStudents },
    { id: 'finance' as NavTab, label: 'Finanse', icon: IconFinance },
    { id: 'reports' as NavTab, label: 'Raporty', icon: IconReports }
  ];

  return (
    <>
      {/* Floating Action Button '+' in thumb reach above tab bar */}
      <button
        onClick={onQuickAdd}
        aria-label="Dodaj szybko"
        style={{
          position: 'fixed',
          bottom: 'calc(var(--safe-bottom) + 68px)',
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: 'var(--ios-blue)',
          color: '#FFFFFF',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0, 122, 255, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 900,
          cursor: 'pointer',
          transition: 'transform 0.15s ease'
        }}
      >
        <IconPlus size={30} />
      </button>

      {/* iOS Bottom Tab Bar */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(var(--safe-bottom) + 56px)',
          backgroundColor: 'var(--ios-card-bg)',
          borderTop: '1px solid var(--ios-separator)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-around',
          paddingTop: 6,
          zIndex: 899,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}
      >
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                color: isActive ? 'var(--ios-blue)' : 'var(--ios-text-secondary)',
                minWidth: 60,
                minHeight: 'var(--tap-target-min)'
              }}
            >
              <Icon size={24} />
              <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
