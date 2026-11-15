import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { PaymentMethod } from '../../domain/types';
import { IconCheck, IconLock, IconRefresh } from '../common/Icons';

interface SettingsViewProps {
  onClose: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const {
    settings,
    activeLegalParam,
    updateSettings,
    updateLegalParams,
    acceptLegalDeclaration,
    testConnection,
    syncNow,
    syncStatus,
    exportBackup,
    restoreBackup,
    resetToSampleData,
    lockApp
  } = useApp();

  // Settings form
  const [tutorName, setTutorName] = useState(settings.tutor_name || 'Marek Wiśniewski');
  const [defaultRateStr, setDefaultRateStr] = useState(Money.format(settings.default_rate || 7000, false));
  const [defaultMethod, setDefaultMethod] = useState<PaymentMethod>(settings.default_payment_method || 'blik');

  // GAS sync
  const [gasUrl, setGasUrl] = useState(settings.gas_web_app_url || '');
  const [gasToken, setGasToken] = useState(settings.gas_secret_token || '');
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string }>({});
  const [isTesting, setIsTesting] = useState(false);

  // Legal params 2026 / 2027
  const [minWageStr, setMinWageStr] = useState(Money.format(activeLegalParam.min_wage, false));
  const [factorPct, setFactorPct] = useState(activeLegalParam.factor_pct);

  // PIN settings
  const [pinEnabled, setPinEnabled] = useState(settings.pin_enabled || false);
  const [newPin, setNewPin] = useState(settings.pin_hash || '1234');

  const handleSaveTutorProfile = async () => {
    const rateGrosze = Money.parse(defaultRateStr);
    await updateSettings({
      tutor_name: tutorName,
      default_rate: rateGrosze,
      default_payment_method: defaultMethod
    });
    alert('Zapisano profil.');
  };

  const handleSaveGasConfig = async () => {
    await updateSettings({
      gas_web_app_url: gasUrl,
      gas_secret_token: gasToken
    });
    alert('Zapisano konfigurację połączenia z Arkuszem Google.');
  };

  const handleTestGas = async () => {
    setIsTesting(true);
    setTestResult({});
    const res = await testConnection(gasUrl, gasToken);
    setTestResult(res);
    setIsTesting(false);
  };

  const handleSaveLegal = async () => {
    const minWageGrosze = Money.parse(minWageStr);
    const calculatedLimit = Money.multiplyPercent(minWageGrosze, factorPct);
    await updateLegalParams({
      ...activeLegalParam,
      min_wage: minWageGrosze,
      factor_pct: factorPct,
      calculated_limit: calculatedLimit
    });
    alert(`Zaktualizowano limit prawny: ${Money.format(calculatedLimit)}`);
  };

  const handleSavePin = async () => {
    await updateSettings({
      pin_enabled: pinEnabled,
      pin_hash: newPin
    });
    alert('Zapisano ustawienia zabezpieczeń PIN.');
  };

  const handleDownloadBackup = async () => {
    const jsonStr = await exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tutor_manager_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await restoreBackup(content);
        alert('Kopia zapasowa została pomyślnie przywrócona.');
      } catch (err: any) {
        alert(`Błąd przywracania: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: '16px 16px 80px 16px', maxWidth: 640, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Ustawienia</h1>
          <span style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
            Konfiguracja aplikacji, limitów i chmury
          </span>
        </div>
        <button onClick={onClose} className="ios-btn ios-btn-secondary" style={{ padding: '6px 14px', fontSize: 13, minHeight: 34 }}>
          Gotowe
        </button>
      </div>

      {/* 1. Oświadczenie prawne działalności nierejestrowanej (Chapter 4.5) */}
      <div className="ios-card" style={{ borderLeft: '4px solid var(--ios-blue)', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Oświadczenie działalności nierejestrowanej
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ios-text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
          Warunek ustawowy (art. 5 ustawy Prawo przedsiębiorców): brak wykonywania działalności gospodarczej w okresie ostatnich 60 miesięcy oraz kontrola kwartalnego limitu przychodu należnego.
        </p>
        {settings.legal_declaration_accepted_at ? (
          <div style={{ fontSize: 12, color: 'var(--ios-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={16} /> Zaakceptowano: {settings.legal_declaration_accepted_at.slice(0, 10)}
          </div>
        ) : (
          <button onClick={acceptLegalDeclaration} className="ios-btn ios-btn-primary" style={{ fontSize: 13, minHeight: 34 }}>
            Potwierdzam spełnienie warunków
          </button>
        )}
      </div>

      {/* 2. Działalność korepetytora */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Profil korepetytora</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Imię i nazwisko</label>
            <input
              type="text"
              className="ios-input"
              value={tutorName}
              onChange={e => setTutorName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Domyślna stawka (zł)</label>
              <input
                type="text"
                className="ios-input"
                value={defaultRateStr}
                onChange={e => setDefaultRateStr(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Płatność domyślna</label>
              <select
                className="ios-input"
                value={defaultMethod}
                onChange={e => setDefaultMethod(e.target.value as PaymentMethod)}
              >
                <option value="blik">BLIK</option>
                <option value="przelew">Przelew</option>
                <option value="gotowka">Gotówka</option>
              </select>
            </div>
          </div>

          <button onClick={handleSaveTutorProfile} className="ios-btn ios-btn-primary" style={{ marginTop: 4 }}>
            Zapisz profil
          </button>
        </div>
      </div>

      {/* 3. Limity prawne (2026 i symulator 2027) */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Parametry prawne (Rok {activeLegalParam.year})
        </h3>
        <p style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 12 }}>
          Limit 2026: 225% × 4 806,00 zł = <strong>10 813,50 zł na kwartał</strong>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Płaca minimalna (zł)</label>
              <input
                type="text"
                className="ios-input"
                value={minWageStr}
                onChange={e => setMinWageStr(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Współczynnik (%)</label>
              <input
                type="number"
                className="ios-input"
                value={factorPct}
                onChange={e => setFactorPct(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--ios-system-bg)', padding: 10, borderRadius: 8, fontSize: 13 }}>
            Wyliczony limit kwartalny:{' '}
            <strong>{Money.format(Money.multiplyPercent(Money.parse(minWageStr || '0'), factorPct))}</strong>
          </div>

          <button onClick={handleSaveLegal} className="ios-btn ios-btn-secondary">
            Zaktualizuj parametry prawne
          </button>
        </div>
      </div>

      {/* 4. Połączenie z Google Apps Script */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Arkusz Google (Google Apps Script Web App)
        </h3>
        <p style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 12 }}>
          Aplikacja działa w pełni offline z IndexedDB. Podaj adres Web App z Apps Script, aby automatycznie synchronizować dane do swojego Arkusza.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Web App URL</label>
            <input
              type="url"
              className="ios-input"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={gasUrl}
              onChange={e => setGasUrl(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Tajny Token (Bearer Token)</label>
            <input
              type="password"
              className="ios-input"
              placeholder="Twój bezpieczny token"
              value={gasToken}
              onChange={e => setGasToken(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={handleTestGas}
              disabled={isTesting}
              className="ios-btn ios-btn-secondary"
            >
              {isTesting ? 'Sprawdzanie...' : 'Testuj połączenie'}
            </button>

            <button
              onClick={handleSaveGasConfig}
              className="ios-btn ios-btn-primary"
            >
              Zapisz URL
            </button>
          </div>

          {testResult.message && (
            <div
              style={{
                fontSize: 12,
                padding: 8,
                borderRadius: 8,
                backgroundColor: testResult.success ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.15)',
                color: testResult.success ? 'var(--ios-green)' : 'var(--ios-red)',
                fontWeight: 600
              }}
            >
              {testResult.message}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--ios-separator)', paddingTop: 10, marginTop: 4 }}>
            <button
              onClick={() => syncNow()}
              disabled={syncStatus.isSyncing}
              className="ios-btn ios-btn-secondary"
              style={{ width: '100%' }}
            >
              <IconRefresh size={16} /> Synchronizuj teraz
            </button>
            {settings.last_sync_at && (
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)', marginTop: 4, textAlign: 'center' }}>
                Ostatnia synchronizacja: {new Date(settings.last_sync_at).toLocaleString('pl-PL')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Bezpieczeństwo i PIN */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Zabezpieczenie aplikacji (PIN / Biometria)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Blokada kodem PIN</div>
              <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>Wymagaj 4 cyfr po bezczynności</div>
            </div>
            <input
              type="checkbox"
              style={{ width: 22, height: 22, accentColor: 'var(--ios-blue)' }}
              checked={pinEnabled}
              onChange={e => setPinEnabled(e.target.checked)}
            />
          </div>

          {pinEnabled && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Kod PIN (4 cyfry)</label>
              <input
                type="password"
                maxLength={4}
                className="ios-input"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
              />
            </div>
          )}

          <button onClick={handleSavePin} className="ios-btn ios-btn-secondary">
            Zapisz PIN
          </button>

          {pinEnabled && (
            <button onClick={lockApp} className="ios-btn ios-btn-secondary">
              <IconLock size={16} /> Zablokuj teraz
            </button>
          )}
        </div>
      </div>

      {/* 6. Kopie zapasowe & Reset */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Kopie zapasowe i reset
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleDownloadBackup} className="ios-btn ios-btn-secondary">
            Eksportuj pełną bazę (JSON)
          </button>

          <div>
            <label className="ios-btn ios-btn-secondary" style={{ width: '100%', cursor: 'pointer' }}>
              Przywróć z pliku JSON
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleFileRestore}
              />
            </label>
          </div>

          <button
            onClick={() => {
              if (confirm('Czy na pewno chcesz przywrócić dane przykładowe? Wszystkie zmiany zostaną nadpisane.')) {
                resetToSampleData();
              }
            }}
            className="ios-btn ios-btn-danger"
            style={{ marginTop: 8 }}
          >
            Przywróć dane przykładowe
          </button>
        </div>
      </div>
    </div>
  );
};
