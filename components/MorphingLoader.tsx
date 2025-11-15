import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export const MorphingLoader: React.FC = () => {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!pathRef.current) return;

    const path = pathRef.current;

    // Shape definitions: circle → triangle → square → pentagon → hexagon → octagon → back to circle
    const shapes = [
      // Circle (approximated with 60 points for smooth morphing)
      'M 50,10 C 71.8,10 90,28.2 90,50 C 90,71.8 71.8,90 50,90 C 28.2,90 10,71.8 10,50 C 10,28.2 28.2,10 50,10 Z',

      // Triangle
      'M 50,15 L 85,75 L 15,75 Z M 50,15 L 85,75 L 15,75 Z M 50,15 L 85,75 L 15,75 Z',

      // Square
      'M 20,20 L 80,20 L 80,80 L 20,80 Z M 20,20 L 80,20 L 80,80 L 20,80 Z',

      // Pentagon
      'M 50,15 L 82,40 L 70,78 L 30,78 L 18,40 Z M 50,15 L 82,40 L 70,78 L 30,78 L 18,40 Z',

      // Hexagon
      'M 50,15 L 80,32.5 L 80,67.5 L 50,85 L 20,67.5 L 20,32.5 Z M 50,15 L 80,32.5 L 80,67.5 L 50,85 L 20,67.5 L 20,32.5 Z',

      // Octagon
      'M 50,15 L 70,22 L 85,37 L 85,63 L 70,78 L 50,85 L 30,78 L 15,63 L 15,37 L 30,22 Z',

      // Back to Circle
      'M 50,10 C 71.8,10 90,28.2 90,50 C 90,71.8 71.8,90 50,90 C 28.2,90 10,71.8 10,50 C 10,28.2 28.2,10 50,10 Z'
    ];

    // Create timeline for infinite morphing
    const tl = gsap.timeline({ repeat: -1 });

    shapes.forEach((shape, index) => {
      tl.to(path, {
        attr: { d: shape },
        duration: 0.8,
        ease: 'power2.inOut',
      });

      // Add rotation during transition
      tl.to(path, {
        rotation: `+=${360 / shapes.length}`,
        transformOrigin: '50% 50%',
        duration: 0.8,
        ease: 'power2.inOut',
      }, `<`);
    });

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="flex items-center justify-center">
      <svg
        width="120"
        height="120"
        viewBox="0 0 100 100"
        className="drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]"
      >
        <defs>
          <linearGradient id="morphGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#1F51FF" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d="M 50,10 C 71.8,10 90,28.2 90,50 C 90,71.8 71.8,90 50,90 C 28.2,90 10,71.8 10,50 C 10,28.2 28.2,10 50,10 Z"
          fill="none"
          stroke="url(#morphGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(6,182,212,0.4));
          }
          50% {
            filter: drop-shadow(0 0 25px rgba(6,182,212,0.8));
          }
        }
        svg {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
