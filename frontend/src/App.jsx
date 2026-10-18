import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import TaskInput from './components/TaskInput';
import ExecutionPanel from './components/ExecutionPanel';
import ResultsPanel from './components/ResultsPanel';
import HistoryPanel from './components/HistoryPanel';
import MemoryPanel from './components/MemoryPanel';
import SettingsPanel from './components/SettingsPanel';
import ProfileDashboard from './components/ProfileDashboard';
import { apiClient } from './api/client';

export default function App() {
  const [activeTab, setActiveTab] = useState('agent');
  const [health, setHealth] = useState(null);
  
  // Active task execution state
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [currentPlan, setCurrentPlan] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const cleanupSseRef = useRef(null);

  // Poll health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await apiClient.getHealth();
        setHealth(data);
      } catch (err) {
        setHealth({ status: 'unhealthy', error: err.message });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Clean up any open SSE connection on unmount
  useEffect(() => {
    return () => {
      if (cleanupSseRef.current) cleanupSseRef.current();
    };
  }, []);

  const handleRunTask = async (userRequest) => {
    setErrorMsg(null);
    setResults(null);
    setLogs([]);
    setCurrentStepIndex(0);
    setIsRunning(true);
    setStatus('planning');

    try {
      const response = await apiClient.createTask(userRequest);
      const taskId = response.taskId;
      setActiveTaskId(taskId);
      setCurrentPlan(response.plan);
      setStatus(response.status);

      // Start SSE progress subscription
      if (cleanupSseRef.current) cleanupSseRef.current();

      cleanupSseRef.current = apiClient.subscribeTaskProgress(
        taskId,
        (event) => {
          handleProgressEvent(event, taskId);
        },
        (err) => {
          console.warn('SSE subscription closed or errored:', err);
        }
      );

    } catch (err) {
      console.error('Task launch failed:', err);
      setErrorMsg(err.message);
      setIsRunning(false);
      setStatus('failed');
    }
  };

  const handleProgressEvent = (event, taskId) => {
    const { type, data, timestamp } = event;

    if (type === 'status') {
      setStatus(data.status);
      if (['completed', 'failed', 'stopped', 'stopped_ambiguous'].includes(data.status)) {
        setIsRunning(false);
      }
    } else if (type === 'step_start') {
      setCurrentStepIndex(data.stepIndex);
      setLogs((prev) => [...prev, { ...data.step, timestamp, status: 'running' }]);
    } else if (type === 'step_complete') {
      setLogs((prev) => {
        // update the matching step
        const filtered = prev.filter(l => l.step_index !== data.stepIndex && l.stepIndex !== data.stepIndex);
        return [...filtered, { ...data.action, timestamp }];
      });
    } else if (type === 'step_failed' || type === 'step_blocked') {
      setLogs((prev) => [...prev, { type, ...data, timestamp, status: 'failed' }]);
    } else if (type === 'ambiguous_target') {
      setLogs((prev) => [...prev, { type, ...data, timestamp, status: 'ambiguous' }]);
    } else if (type === 'complete') {
      setStatus(data.status);
      setResults(data.result);
      setIsRunning(false);
    } else if (type === 'error') {
      setErrorMsg(data.message);
      setIsRunning(false);
      setStatus('failed');
    }
  };

  const handleStopTask = async (taskId) => {
    if (!taskId) return;
    try {
      await apiClient.stopTask(taskId);
      setStatus('stopping');
    } catch (err) {
      alert(`Stop failed: ${err.message}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} health={health} />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem', width: '100%', flex: 1 }}>
        {activeTab === 'agent' && (
          <div className="animate-fade-in">
            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '0.85rem 1.25rem',
                borderRadius: 8,
                marginBottom: '1.25rem',
                fontSize: '0.875rem'
              }}>
                <strong>Task Execution Warning:</strong> {errorMsg}
              </div>
            )}

            <TaskInput
              onRunTask={handleRunTask}
              onStopTask={handleStopTask}
              isRunning={isRunning}
              activeTaskId={activeTaskId}
            />

            <ExecutionPanel
              plan={currentPlan}
              logs={logs}
              status={status}
              currentStepIndex={currentStepIndex}
            />

            <ResultsPanel
              results={results}
              status={status}
            />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <ProfileDashboard
              onRunTask={handleRunTask}
              setActiveTab={setActiveTab}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-fade-in">
            <HistoryPanel />
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="animate-fade-in">
            <MemoryPanel />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-fade-in">
            <SettingsPanel />
          </div>
        )}
      </main>
    </div>
  );
}
