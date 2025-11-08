import React, { useState, useEffect } from 'react';

export const AnimatedLogo: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Start animation after 3 seconds
    const timer = setTimeout(() => {
      setIsCollapsed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <h1
      className="text-[1.75rem] sm:text-3xl font-bold tracking-tight relative"
      style={{
        color: '#1F51FF',
        fontFamily: "'Montserrat', sans-serif",
        textShadow: '0 0 20px rgba(31, 81, 255, 0.3)',
      }}
    >
      <span className="inline-flex items-center relative">
        {/* D - stays in place */}
        <span
          className="inline-block"
          style={{
            transition: 'none',
          }}
        >
          D
        </span>

        {/* odgy - fades out */}
        <span
          className="inline-block overflow-hidden"
          style={{
            maxWidth: isCollapsed ? '0px' : '100px',
            opacity: isCollapsed ? 0 : 1,
            transition: 'max-width 0.8s ease-in-out, opacity 0.6s ease-in-out',
          }}
        >
          odgy
        </span>

        {/* S - slides in next to D */}
        <span
          className="inline-block"
          style={{
            transform: isCollapsed ? 'translateX(0)' : 'translateX(0)',
            transition: 'transform 0.8s ease-in-out',
          }}
        >
          S
        </span>

        {/* of - fades out */}
        <span
          className="inline-block overflow-hidden"
          style={{
            maxWidth: isCollapsed ? '0px' : '100px',
            opacity: isCollapsed ? 0 : 1,
            transition: 'max-width 0.8s ease-in-out, opacity 0.6s ease-in-out',
          }}
        >
          of
        </span>

        {/* t - slides in next to S */}
        <span
          className="inline-block"
          style={{
            transform: isCollapsed ? 'translateX(0)' : 'translateX(0)',
            transition: 'transform 0.8s ease-in-out',
          }}
        >
          t
        </span>

        {/* . - stays in place */}
        <span
          className="inline-block"
          style={{
            transition: 'none',
          }}
        >
          .
        </span>
      </span>
    </h1>
  );
};
