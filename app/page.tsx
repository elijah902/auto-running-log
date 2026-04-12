'use client';

import { useState, useEffect } from 'react';

const CONFIG = {
  clientId: '122915',
  stravaAuth: 'https://www.strava.com/oauth/authorize',
  stravaActivities: 'https://www.strava.com/api/v3/athlete/activities'
};

function getWeekStart() {
  const now = new Date();
  const currentDay = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((currentDay + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  return Math.floor(startOfWeek.getTime() / 1000);
}

function getWeekEnd() {
  const now = new Date();
  const currentDay = now.getDay();
  const endOfWeek = new Date(now);
  const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  endOfWeek.setHours(23, 59, 59, 999);
  return Math.floor(endOfWeek.getTime() / 1000);
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

function formatTimeFromSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function metersToMiles(meters: number) {
  return meters * 0.000621371;
}

function secondsToMinutes(seconds: number) {
  return seconds / 60;
}

function getDayOfWeekIndex(dateString: string) {
  const date = new Date(dateString);
  return (date.getDay() + 6) % 7;
}

export default function Home() {
  const [autoCopyEnabled, setAutoCopyEnabled] = useState(false);
  const [generateNotes, setGenerateNotes] = useState(true);
  const [recoveryActivities, setRecoveryActivities] = useState<Record<number, string[]>>({});
  const [lastDayOffRunning, setLastDayOffRunning] = useState('');
  const [lastCompleteDayOff, setLastCompleteDayOff] = useState('');
  const [results, setResults] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAutoCopyEnabled(sessionStorage.getItem('autoCopyEnabled') === 'true');
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      setLoading(true);
      handleAuthCallback(code);
    }
  }, []);

  const toggleAutoCopy = () => {
    const newValue = !autoCopyEnabled;
    setAutoCopyEnabled(newValue);
    sessionStorage.setItem('autoCopyEnabled', String(newValue));
  };

  const toggleRecoveryActivity = (day: number, activity: string) => {
    setRecoveryActivities(prev => {
      const dayActivities = prev[day] || [];
      if (dayActivities.includes(activity)) {
        return { ...prev, [day]: dayActivities.filter(a => a !== activity) };
      }
      return { ...prev, [day]: [...dayActivities, activity] };
    });
  };

  const exchangeCodeForToken = async (code: string) => {
    const response = await fetch('/api/strava/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.access_token;
  };

  const fetchActivities = async (accessToken: string, startEpoch: number, endEpoch: number) => {
    const url = `${CONFIG.stravaActivities}?before=${endEpoch}&after=${startEpoch}&page=1&per_page=30`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  };

  const generateNotesApi = async (days: any[], weekMileage: number, weekXT: number) => {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, weekMileage, weekXT })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.notes;
  };

  const formatTimeWithoutLeadingZero = (seconds: number) => {
    const formatted = formatTimeFromSeconds(seconds);
    return formatted.startsWith('0:') ? formatted.substring(2) : formatted;
  };

  const generatePlainTextLog = (weekData: any, notes: Record<string, string> = {}) => {
    let logText = '';

    weekData.days.forEach((dayData: any) => {
      logText += `Day- ${dayData.dayName}\n`;
      
      if (dayData.hasActivities) {
        const runs = dayData.activities
          .filter((a: any) => a.type === 'Run')
          .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
        
        if (runs.length > 0) {
          const mileages = runs.map((a: any) => metersToMiles(a.distance).toFixed(2));
          const times = runs.map((a: any) => formatTimeWithoutLeadingZero(a.moving_time));
          logText += `Mileage: ${mileages.join(', ')} miles\n`;
          logText += `Time Ran: ${times.join(', ')}\n`;
        } else {
          logText += `Mileage: n/a\nTime Ran: n/a\n`;
        }
      } else {
        logText += `Mileage: n/a\nTime Ran: n/a\n`;
      }

      logText += `Where: n/a\n`;
      logText += `Speed Development: n/a\n`;
      logText += `Splits (if a workout): n/a\n`;
      logText += `XT Activity/Time: ${dayData.crossTrainingMinutes > 0 ? formatTime(dayData.crossTrainingMinutes) : 'n/a'}\n`;
      
      const recoveryText = dayData.recoveryActivities.length > 0
        ? dayData.recoveryActivities.map((a: string) => a.replace(/_/g, ' ')).join(', ')
        : 'n/a';
      logText += `Recovery Activities: ${recoveryText}\n`;
      logText += `Sleep (Hrs/Info): n/a\n`;
      logText += `Notes: ${notes[dayData.dayName] || 'n/a'}\n\n`;
    });

    logText += `Weekly Summary-\n`;
    logText += `Total Mileage: ${weekData.totals.mileage.toFixed(1)}\n`;
    logText += `Total XT min: ${weekData.totals.crossTrainingMinutes > 0 ? Math.round(weekData.totals.crossTrainingMinutes) : 'n/a'}\n`;
    logText += `Last Day off Running: ${weekData.lastDayOffRunning || 'n/a'}\n`;
    logText += `Last Complete Day off (no run or xt): ${weekData.lastCompleteDayOff || 'n/a'}\n`;
    logText += `Total Recovery Activities For Week: ${weekData.recoverySummary || 'n/a'}\n`;
    logText += `Thoughts on Overall Week: n/a\n`;
    logText += `Goals for Upcoming Week: n/a\n`;

    return logText;
  };

  const processWeeklyActivities = (activities: any[]): any => {
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekData: any = {
      days: [],
      totals: { mileage: 0, crossTrainingMinutes: 0 },
      lastDayOffRunning: lastDayOffRunning || null,
      lastCompleteDayOff: lastCompleteDayOff || null,
      recoverySummary: ''
    };

    for (const [dayIndex, dayName] of daysOfWeek.entries()) {
      const dayActivities = activities.filter((a: any) => getDayOfWeekIndex(a.start_date) === dayIndex);
      
      let totalMileage = 0;
      let crossTrainingMinutes = 0;

      dayActivities.forEach((activity: any) => {
        if (activity.type === 'Run') {
          totalMileage += metersToMiles(activity.distance);
        } else {
          crossTrainingMinutes += secondsToMinutes(activity.moving_time);
        }
      });

      weekData.totals.mileage += totalMileage;
      weekData.totals.crossTrainingMinutes += crossTrainingMinutes;

      weekData.days.push({
        dayName,
        dayIndex,
        activities: dayActivities,
        totalMileage,
        crossTrainingMinutes,
        hasActivities: dayActivities.length > 0,
        recoveryActivities: recoveryActivities[dayIndex] || []
      });
    }

    const summary: Record<string, number> = { leg_elevation: 0, cold_tub: 0, recovery_boots: 0 };
    
    weekData.days.forEach((day: any) => {
      day.recoveryActivities.forEach((activity: string) => {
        if (summary.hasOwnProperty(activity)) {
          summary[activity]++;
        }
      });
    });

    const parts: string[] = [];
    if (summary.leg_elevation > 0) parts.push(`${summary.leg_elevation} - Leg elevation each day`);
    if (summary.cold_tub > 0) parts.push('Cold tub');
    if (summary.recovery_boots > 0) parts.push('Recovery boots');
    weekData.recoverySummary = parts.length > 0 ? parts.join(', ') : 'n/a';

    return weekData;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Running log copied to clipboard!');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Running log copied to clipboard!');
    }
  };

  const handleCreateLog = () => {
    const redirectURI = encodeURIComponent(window.location.origin + '/');
    const scope = 'activity:read_all';
    const url = `${CONFIG.stravaAuth}?client_id=${CONFIG.clientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
    window.location.href = url;
  };

  const handleAuthCallback = async (code: string) => {
    try {
      const accessToken = await exchangeCodeForToken(code);
      const activities = await fetchActivities(accessToken, getWeekStart(), getWeekEnd());
      
      const weekData = processWeeklyActivities(activities);
      
      let notes: Record<string, string> = {};
      if (generateNotes) {
        try {
          notes = await generateNotesApi(weekData.days, weekData.totals.mileage, weekData.totals.crossTrainingMinutes);
        } catch (e) {
          console.error('Notes generation failed:', e);
        }
      }

      const plainTextLog = generatePlainTextLog(weekData, notes);
      setResults(plainTextLog);
      
      if (autoCopyEnabled) {
        setTimeout(() => copyToClipboard(plainTextLog), 100);
      }
      
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      alert(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fullDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div style={styles.container}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <button 
            id="autoCopyButton" 
            onClick={toggleAutoCopy}
            style={{
              ...styles.autoCopyButton,
              ...(autoCopyEnabled ? styles.autoCopyButtonActive : {})
            }}
          >
            Enable Auto-Copy
          </button>
        </div>

        <div style={styles.options}>
          <h3 style={{ marginTop: 0, color: '#e6edf3' }}>Options</h3>
          
          <div style={styles.optionGroup}>
            <label style={styles.label}>
              <input 
                type="checkbox" 
                checked={generateNotes} 
                onChange={(e) => setGenerateNotes(e.target.checked)} 
              />
              Generate Notes with AI
            </label>
          </div>

          <div style={styles.optionGroup}>
            <h4 style={{ margin: '0 0 10px 0', color: '#e6edf3' }}>Recovery Activities This Week</h4>
            <div style={styles.recoveryGrid}>
              {days.map((day, dayIndex) => (
                <div key={dayIndex} style={styles.recoveryDay}>
                  <span style={styles.dayLabel}>{day}</span>
                  {['leg_elevation', 'cold_tub', 'recovery_boots'].map(activity => (
                    <label key={activity} style={styles.checkboxLabel}>
                      <input 
                        type="checkbox" 
                        checked={recoveryActivities[dayIndex]?.includes(activity) || false}
                        onChange={() => toggleRecoveryActivity(dayIndex, activity)}
                      />
                      {activity === 'leg_elevation' ? 'Leg Elev' : activity === 'cold_tub' ? 'Cold Tub' : 'Boots'}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div style={styles.optionGroup}>
            <label style={styles.label}>Last Day off Running:</label>
            <select 
              value={lastDayOffRunning} 
              onChange={(e) => setLastDayOffRunning(e.target.value)}
              style={styles.select}
            >
              <option value="">Select day...</option>
              {fullDayNames.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>

          <div style={styles.optionGroup}>
            <label style={styles.label}>Last Complete Day off (no run or xt):</label>
            <select 
              value={lastCompleteDayOff} 
              onChange={(e) => setLastCompleteDayOff(e.target.value)}
              style={styles.select}
            >
              <option value="">Select day...</option>
              {fullDayNames.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
        </div>

        <button 
          className="button" 
          onClick={handleCreateLog} 
          disabled={loading}
          style={styles.button}
        >
          {loading ? 'Loading...' : 'Create log'}
        </button>

        {results && <pre style={styles.pre}>{results}</pre>}
      </div>

      <style>{`
        body { 
          background-color: #0d1117; 
          color: #e6edf3; 
          margin: 0; 
          padding: 20px; 
          font-family: Arial, sans-serif; 
        }
        .button { 
          background-color: #1b7533; 
          border: none; 
          display: block; 
          margin: 20px auto; 
          border-radius: 150px; 
          color: white; 
          padding: 45px 90px; 
          font-size: 54px; 
          cursor: pointer; 
          transition: all 0.3s ease; 
        }
        .button:hover { transform: scale(1.05); }
        .button:disabled { opacity: 0.5; cursor: not-allowed; }
        pre { white-space: pre-wrap; word-wrap: break-word; text-align: left; max-width: 800px; margin: 0 auto; }
        @media (max-width: 768px) { .recovery-grid { grid-template-columns: repeat(4, 1fr) !important; } }
        @media (max-width: 480px) { .recovery-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0d1117',
    color: '#e6edf3',
  },
  autoCopyButton: {
    backgroundColor: '#30363d',
    border: '1px solid #8b949e',
    color: '#e6edf3',
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    borderRadius: '8px',
  },
  autoCopyButtonActive: {
    backgroundColor: '#1b7533',
    borderColor: '#1b7533',
    color: 'white',
  },
  options: {
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  optionGroup: {
    marginBottom: '15px',
    paddingBottom: '15px',
    borderBottom: '1px solid #30363d',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    color: '#e6edf3',
  },
  recoveryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '10px',
  },
  recoveryDay: {
    backgroundColor: '#0d1117',
    borderRadius: '4px',
    padding: '8px',
    textAlign: 'center',
  },
  dayLabel: {
    display: 'block',
    fontWeight: 'bold',
    marginBottom: '5px',
    fontSize: '12px',
    color: '#8b949e',
  },
  checkboxLabel: {
    display: 'block',
    fontSize: '11px',
    margin: '3px 0',
    textAlign: 'left',
    color: '#e6edf3',
  },
  select: {
    backgroundColor: '#0d1117',
    color: '#e6edf3',
    border: '1px solid #30363d',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '14px',
    minWidth: '200px',
  },
  button: {
    backgroundColor: '#1b7533',
    border: 'none',
    display: 'block',
    margin: '20px auto',
    borderRadius: '150px',
    color: 'white',
    padding: '45px 90px',
    fontSize: '54px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  pre: {
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    textAlign: 'left',
    maxWidth: '800px',
    margin: '0 auto',
    color: '#e6edf3',
  },
};
