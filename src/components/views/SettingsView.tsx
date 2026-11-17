import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { PaymentMethod } from '../../domain/types';
import { getWarsawDateStr } from '../../domain/dateUtils';
import { IconCheck, IconLock, IconRefresh, IconDownload } from '../common/Icons';

interface SettingsViewProps {
  onClose: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const {
    settings,
    activeLegalParam,
    offlineQueueCount,
    rejectedOperations,
    retryRejectedOperation,
    retryAllRejectedOperations,
    dismissRejectedOperation,
    clearAllRejectedOperations,
    updateSettings,
    updateLegalParams,
    acceptLegalDeclaration,
    setAppPin,
    testConnection,
    syncNow,
    forcePushAll,
    pullCleanFromGas,
    syncStatus,
    exportBackup,
    restoreBackup,
    clearUserData,
    loadDemoData,
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

  // Legal params
  const [minWageStr, setMinWageStr] = useState(Money.format(activeLegalParam.min_wage, false));
  const [factorPct, setFactorPct] = useState(activeLegalParam.factor_pct);

  // PIN
  const [pinEnabled, setPinEnabled] = useState(settings.pin_enabled || false);
  const [newPin, setNewPin] = useState('');

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
    if (newPin && newPin.length === 4) {
      await setAppPin(newPin);
      alert('Kod PIN został bezpiecznie zahashowany algorytmem SHA-256 i zapisany.');
      setNewPin('');
    } else {
      await updateSettings({ pin_enabled: pinEnabled });
      alert('Zapisano status blokady.');
    }
  };

  const handleDownloadBackup = async () => {
    const jsonStr = await exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tutor_manager_backup_${getWarsawDateStr()}.json`;
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

      {/* 1. Oświadczenie prawne działalności nierejestrowanej */}
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

      {/* 3. Limity prawne */}
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
          Podaj adres Web App z Apps Script, aby automatycznie synchronizować dane do swojego prywatnego Arkusza Google.
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
            <label style={{ fontSize: 12, fontWeight: 600 }}>Tajny Token (SECRET_TOKEN ze skryptu)</label>
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
            <button
              onClick={async () => {
                const res = await forcePushAll();
                alert(res.message);
              }}
              disabled={syncStatus.isSyncing}
              className="ios-btn ios-btn-secondary"
              style={{ width: '100%', marginTop: 8, fontSize: 13 }}
            >
              <IconDownload size={16} style={{ transform: 'rotate(180deg)' }} /> Wyślij całą bazę do Arkusza Google
            </button>
            <button
              onClick={async () => {
                if (confirm('Czy chcesz pobrać czyste dane z Twojego Arkusza Google? To usunie lokalne duplikaty i naprawi sumy finansowe.')) {
                  const res = await pullCleanFromGas();
                  alert(res.message);
                }
              }}
              disabled={syncStatus.isSyncing}
              className="ios-btn ios-btn-secondary"
              style={{ width: '100%', marginTop: 8, fontSize: 13, color: 'var(--ios-blue)', fontWeight: 600 }}
            >
              <IconRefresh size={16} /> Pobierz czyste dane z Arkusza (Napraw sumy)
            </button>
            <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'var(--ios-bg)', border: '1px solid var(--ios-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--ios-text-secondary)' }}>Oczekujące w kolejce offline:</span>
                <span style={{ fontWeight: 600 }}>{offlineQueueCount} operacji</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--ios-text-secondary)' }}>Ostatnia udana synchronizacja:</span>
                <span style={{ fontWeight: 600 }}>
                  {settings.last_sync_at ? new Date(settings.last_sync_at).toLocaleString('pl-PL') : 'Brak danych'}
                </span>
              </div>
            </div>

            {rejectedOperations.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ios-red)' }}>
                    ⚠️ Odrzucone operacje ({rejectedOperations.length})
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={retryAllRejectedOperations}
                      className="ios-btn ios-btn-primary"
                      style={{ fontSize: 11, padding: '3px 8px', minHeight: 24 }}
                    >
                      Ponów wszystkie
                    </button>
                    <button
                      onClick={clearAllRejectedOperations}
                      className="ios-btn ios-btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px', minHeight: 24, color: 'var(--ios-red)' }}
                    >
                      Wyczyść
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)', marginBottom: 8 }}>
                  Operacje odrzucone przez Google Apps Script. Kliknij „Ponów”, aby przesłać je ponownie do Arkusza.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {rejectedOperations.map(op => (
                    <div
                      key={op.op_id}
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        background: 'var(--ios-card-bg)',
                        border: '1px solid var(--ios-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                          {op.action} • {op.table}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => retryRejectedOperation(op.op_id)}
                            className="ios-btn ios-btn-primary"
                            style={{ fontSize: 11, padding: '2px 8px', minHeight: 22 }}
                          >
                            Ponów
                          </button>
                          <button
                            onClick={() => dismissRejectedOperation(op.op_id)}
                            className="ios-btn ios-btn-secondary"
                            style={{ fontSize: 11, padding: '2px 8px', minHeight: 22, color: 'var(--ios-red)' }}
                          >
                            Odrzuć
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ios-red)', fontWeight: 500 }}>
                        {op.error || 'Błąd zapisu w Arkuszu'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--ios-text-secondary)' }}>
                        {op.timestamp.slice(0, 19).replace('T', ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Bezpieczeństwo i PIN (SHA-256 Hashing) */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Zabezpieczenie ekranu (Blokada PIN)
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
              <label style={{ fontSize: 12, fontWeight: 600 }}>Nowy kod PIN (4 cyfry)</label>
              <input
                type="password"
                maxLength={4}
                placeholder="Wpisz 4 cyfry"
                className="ios-input"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
              />
            </div>
          )}

          <button onClick={handleSavePin} className="ios-btn ios-btn-secondary">
            Zapisz ustawienia PIN
          </button>

          {pinEnabled && (
            <button onClick={lockApp} className="ios-btn ios-btn-secondary">
              <IconLock size={16} /> Zablokuj teraz
            </button>
          )}
        </div>
      </div>

      {/* 6. Zarządzanie danymi (Czysta baza vs demo) */}
      <div className="ios-card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Zarządzanie danymi
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => {
              if (confirm('Czy chcesz wyczyścić wszystkie dane i zacząć od zera? (Parametry prawne zostaną zachowane)')) {
                clearUserData();
                alert('Baza danych została wyczyszczona. Możesz wprowadzać własnych uczniów.');
              }
            }}
            className="ios-btn ios-btn-secondary"
            style={{ color: 'var(--ios-red)' }}
          >
            Wyczyść dane (Zacznij od zera)
          </button>

          <button
            onClick={() => {
              if (confirm('Czy chcesz załadować przykładowe dane demonstracyjne (uczniowie, lekcje)?')) {
                loadDemoData();
                alert('Załadowano dane demonstracyjne.');
              }
            }}
            className="ios-btn ios-btn-secondary"
          >
            Załaduj przykładowe dane (demo)
          </button>

          <button onClick={handleDownloadBackup} className="ios-btn ios-btn-secondary">
            Eksportuj kopię bazy (JSON)
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
        </div>
      </div>
    </div>
  );
};
