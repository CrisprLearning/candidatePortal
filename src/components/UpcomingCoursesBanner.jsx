import React, { useEffect, useState } from 'react';
import { Icon } from './Icons';

const SLIDE_MS = 2000;

function Message({ course }) {
  return (
    <>
      <span className="cp-upcoming-strip-icon"><Icon.Calendar width={16} height={16} /></span>
      <span>
        You're registered for <b>{course.code} - {course.title}</b>.{' '}
        {course.commencement && !course.commenced ? <>Classes begin on <b>{course.commencement}</b>.</> : <>Classes will begin soon.</>} Stay tuned!
      </span>
    </>
  );
}

/**
 * The banner on /courses for courses paid for but not enrolled in yet
 * (upcoming-courses.php). One course is a plain strip. Several share one strip
 * as a slider that moves on every 2 seconds and wraps around; it waits while
 * the pointer or the keyboard focus is on it, and the dots jump to a course.
 */
export default function UpcomingCoursesBanner({ courses }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = courses.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  if (count === 1) {
    return <div className="cp-upcoming-strip" role="status"><Message course={courses[0]} /></div>;
  }

  return (
    <div
      className="cp-upcoming-strip cp-upcoming-slider"
      role="group"
      aria-roledescription="carousel"
      aria-label="Courses you are registered for"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="cp-upcoming-viewport">
        <div className="cp-upcoming-track" style={{ transform: `translateX(-${current * 100}%)` }}>
          {courses.map((c, i) => (
            <div
              key={c.code}
              className="cp-upcoming-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== current}
            >
              <Message course={c} />
            </div>
          ))}
        </div>
      </div>
      <div className="cp-upcoming-dots">
        {courses.map((c, i) => (
          <button
            key={c.code}
            type="button"
            className={i === current ? 'is-active' : ''}
            aria-label={`Show ${c.code} - ${c.title}`}
            aria-current={i === current}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
