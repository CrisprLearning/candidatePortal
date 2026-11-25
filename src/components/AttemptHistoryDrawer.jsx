import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icons';
import { Pill } from './ui';
import { examDate } from '../lib/format';
import { getQuizAttemptHistory } from '../lib/candidateApi';

// Whole numbers as they are, decimals to one place.
function marks(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// "4:30 pm, 15 Nov, 2026" -> "4:30 pm"
function timeOf(dateOfExam) {
  const match = String(dateOfExam || '').match(/^\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
  return match ? match[1] : '';
}

function AttemptRow({ attempt, onView }) {
  const { reportReady, score, maxScore, classAverage, topScore, classStrength, accuracy } = attempt;
  const hasClass = classAverage !== null && classAverage !== undefined;
  const diff = reportReady && hasClass ? Number(score) - Number(classAverage) : null;
  const time = timeOf(attempt.dateOfExam);
  return (
    <li className="cp-attempt">
      <div className="cp-attempt-head">
        <div className="cp-attempt-title">
          <strong>{attempt.title || 'Quiz'}</strong>
          <small>{examDate(attempt.dateOfExam)}{time && ` · ${time}`}</small>
        </div>
        <button
          type="button"
          className="cp-icon-btn"
          aria-label={`View performance: ${attempt.title || 'quiz'}`}
          title={reportReady ? 'View Performance' : 'The report is not ready yet'}
          disabled={!reportReady}
          onClick={() => onView(attempt)}
        >
          <Icon.BarChart width={18} height={18} />
        </button>
      </div>

      <div className="cp-attempt-stats">
        <div className="is-mine">
          <small>My score</small>
          {reportReady
            ? <strong>{marks(score)}{maxScore ? <i> / {marks(maxScore)}</i> : null}</strong>
            : <strong className="is-pending">Pending</strong>}
        </div>
        <div>
          <small>Class average</small>
          <strong>{hasClass ? marks(classAverage) : '-'}</strong>
        </div>
        <div>
          <small>Top score</small>
          <strong>{topScore !== null && topScore !== undefined ? marks(topScore) : '-'}</strong>
        </div>
      </div>

      <div className="cp-attempt-foot">
        {!reportReady && <Pill tone="sky" size="sm">Report being prepared</Pill>}
        {diff !== null && diff > 0 && <Pill tone="lime" size="sm"><Icon.ArrowUp width={12} height={12} /> {marks(diff)} above class average</Pill>}
        {diff !== null && diff < 0 && <Pill tone="orange" size="sm"><Icon.ArrowDown width={12} height={12} /> {marks(-diff)} below class average</Pill>}
        {diff === 0 && <Pill tone="ghost" size="sm">At the class average</Pill>}
        {reportReady && accuracy !== null && accuracy !== undefined && <Pill tone="ghost" size="sm">{marks(accuracy)}% accuracy</Pill>}
        {classStrength > 0 && <Pill tone="ghost" size="sm">{classStrength} {classStrength === 1 ? 'student' : 'students'}</Pill>}
      </div>
    </li>
  );
}

/**
 * "Previous Attempts" on /quizzes: a drawer from the right listing the
 * candidate's finished quiz attempts, newest first, with their score against
 * the class average and top score. The chart button on a row opens that
 * attempt's report. Closes on Escape or a tap outside.
 */
export default function AttemptHistoryDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const closeRef = useRef(null);
  const [state, setState] = useState({ list: null, page: 0, hasMore: false, loading: false, error: false });

  function load(page) {
    setState((s) => ({ ...s, loading: true, error: false }));
    getQuizAttemptHistory(page)
      .then((d) => setState((s) => ({
        list: page === 0 ? (d?.attempts || []) : [...(s.list || []), ...(d?.attempts || [])],
        page, hasMore: !!d?.hasMore, loading: false, error: false,
      })))
      .catch(() => setState((s) => ({ ...s, loading: false, error: true })));
  }

  // Fresh list every time the drawer opens: an attempt may just have been made.
  useEffect(() => {
    if (!open) return undefined;
    load(0);
    closeRef.current?.focus();
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const { list, hasMore, loading, error, page } = state;

  return (
    <div className="cp-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside className="cp-drawer" role="dialog" aria-modal="true" aria-labelledby="cp-attempts-title">
        <header className="cp-drawer-head">
          <div>
            <h2 id="cp-attempts-title">Previous Attempts</h2>
            <p>Your quiz scores against the class.</p>
          </div>
          <button ref={closeRef} type="button" className="cp-icon-btn" aria-label="Close" onClick={onClose}><Icon.X width={18} height={18} /></button>
        </header>

        <div className="cp-drawer-body">
          {list === null && loading && (
            <ul className="cp-attempt-list" aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className="cp-attempt cp-skeleton" style={{ minHeight: 132 }} />)}
            </ul>
          )}

          {list && list.length === 0 && (
            <div className="cp-drawer-empty">
              <span className="cp-state-icon"><Icon.FileText /></span>
              <strong>No attempts yet</strong>
              <p>Quizzes you finish will be listed here with your score.</p>
            </div>
          )}

          {list && list.length > 0 && (
            <ul className="cp-attempt-list">
              {list.map((a) => (
                <AttemptRow key={a.attemptId} attempt={a} onView={(x) => navigate(`/weekly-report?attemptId=${x.attemptId}`)} />
              ))}
            </ul>
          )}

          {error && (
            <div className="cp-drawer-empty">
              <p>Could not load your attempts.</p>
              <button type="button" className="cp-btn cp-btn-ghost cp-btn-sm" onClick={() => load(list ? page + 1 : 0)}>Try again</button>
            </div>
          )}

          {list && hasMore && !error && (
            <div className="cp-drawer-more">
              <button type="button" className="cp-btn cp-btn-ghost cp-btn-sm" disabled={loading} onClick={() => load(page + 1)}>
                {loading ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
